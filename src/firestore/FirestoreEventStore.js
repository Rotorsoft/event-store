'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Event = require('../Event')
const Err = require('../Err')
const Padder = require('./Padder')
const Lease = require('../Lease')

function snapshotPath (tenant, path) {
  return '/tenants/'.concat(tenant, path || '/snapshots')
}

function streamPath (tenant, stream) {
  return '/tenants/'.concat(tenant, '/streams/', stream)
}

module.exports = class FirestoreEventStore extends IEventStore {
  constructor (firestore) {
    super()
    this.firestore = firestore
    Object.freeze(this)
  }

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const PAGE = 1000
    const { actor, aggregateType } = context
    const collRef = this.firestore.collection(snapshotPath(actor.tenant, aggregateType.path))
    if (aggregateId) {
      // load snapshot if path provided
      const doc = aggregateType.path ? await collRef.doc(aggregateId).get() : null
      const aggregate = Aggregate.create(aggregateType, doc && doc.exists ? doc.data() : { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const eventsRef = this.firestore.collection(streamPath(actor.tenant, aggregateType.stream).concat('/events'))
        const events = await eventsRef
          .where('agg_type', '==', aggregateType.name)
          .where('agg_id', '==', aggregate.aggregateId)
          .where('agg_version', '>', aggregate.aggregateVersion)
          .limit(PAGE)
          .get()
        
        // replay events
        events.forEach(doc => {
          const event = new Event(doc.data())
          aggregate.events[event.name](event)
          aggregate._aggregate_version_++
        })

        if (events.size < PAGE) break
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: collRef.doc().id })
  }

  async commitEvents (context, aggregate, expectedVersion = -1) {
    const { actor, aggregateType } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()

    const streamRef = this.firestore.doc(streamPath(actor.tenant, aggregateType.stream))
    const eventsRef = streamRef.collection('events')
    
    return await this.firestore.runTransaction(async transaction => {
      const events = []

      // get stream version
      const doc = await transaction.get(streamRef)
      const stream = doc.data()
      let version = (stream && typeof stream.version !== 'undefined') ? stream.version : -1
      
      // check aggregate version is latest
      const check = await eventsRef
        .where('agg_type', '==', aggregateType.name)
        .where('agg_id', '==', aggregate.aggregateId)
        .where('agg_version', '>', expectedVersion)
        .limit(1).get()
      if (!check.empty) throw Err.concurrency()

      for(let event of aggregate._uncommitted_events_) {
        const eventId = Padder.pad(++version)
        const eventObject = event.toObject(context, aggregate.aggregateId, ++expectedVersion)
        await transaction.set(eventsRef.doc(eventId), eventObject)
        events.push(eventObject)
      }
      await transaction.set(streamRef, { version }, { merge: true })
      aggregate._aggregate_version_ = expectedVersion

      if (aggregateType.path) {
        const aggregateRef = this.firestore.collection(snapshotPath(actor.tenant, aggregateType.path)).doc(aggregate.aggregateId)
        await transaction.set(aggregateRef, aggregate.clone())
      }
      return events
    })
  }

  async pollStream (context, limit = 10) {
    const path = streamPath(context.tenant, context.stream)
    const streamRef = this.firestore.doc(path)

    return await this.firestore.runTransaction(async transaction => {
      const doc = await streamRef.get()
      const stream = doc.data() || {}
  
      // skip if stream is currently leased
      const now = Date.now()
      if (stream.lease && (stream.lease.expiresAt || 0) > now) return null
  
      const streamCursors = Object.assign({}, stream.cursors)
      const cursors = {}
      const version = typeof stream.version !== 'undefined' ? stream.version : -1
      // init cursors and get min version to poll
      const offset = context.handlers.reduce((offset, handler) => {
        const cursor = typeof streamCursors[handler.name] === 'undefined' ? -1 : streamCursors[handler.name]
        cursors[handler.name] = cursor
        return cursor < offset ? cursor : offset
      }, 1e12-1) + 1

      // load events
      const events = []
      const eventsRef = this.firestore.collection(path.concat('/events'))
      const query = await eventsRef.where('__name__', '>=', Padder.pad(offset)).limit(limit).get()
      query.forEach(doc => events.push(new Event(doc.data())))

      // save lease
      const expiresAt = Date.now() + context.timeout
      if (events.length) await transaction.set(streamRef, { lease: { token: now, version, offset, expiresAt }}, { merge: true })
      return new Lease({ token: now, version, cursors, offset, events, expiresAt })
    })
  }

  async commitCursors(context, lease) {
    if (!lease.events.length) return false
    const path = streamPath(context.tenant, context.stream)
    const streamRef = this.firestore.doc(path)
    
    return await this.firestore.runTransaction(async transaction => {
      const doc = await transaction.get(streamRef)
      const stream = doc.data() || {}

      // commit when lease matches
      if (!(stream.lease && stream.lease.token === lease.token)) Err.concurrency()
      await transaction.set(streamRef, { cursors: lease.cursors, lease: {}}, { merge: true })
      return context.handlers.filter(h => lease.cursors[h.name] < lease.version).length > 0
    })
  }
}
