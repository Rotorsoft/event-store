'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Event = require('../Event')
const Err = require('../Err')
const Padder = require('../Padder')
const Lease = require('../Lease')

const snapshotPath = (tenant, path) => '/tenants/'.concat(tenant, path || '/snapshots')
const streamPath = (tenant, stream) => '/tenants/'.concat(tenant, '/streams/', stream)

const getStreamVersion = async eventsRef => {
  const snap = await eventsRef.orderBy('id', 'desc').limit(1).get()
  return snap.empty ? -1 : Number.parseInt(snap.docs[0].id)
}

const logStream = async (method, context, streamRef) => {
  console.log('')
  console.log(`========== ${method} == ${context.tenant}-${context.stream}-${context.thread} =============`)
  const threads = await streamRef.collection('threads').get()
  threads.forEach(thread => {
    console.log(`------------ ${thread.id} --------------`)
    console.log(thread.data())
  })
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
      // check that expected aggregate version is latest
      const check = await eventsRef
        .where('agg_type', '==', aggregateType.name)
        .where('agg_id', '==', aggregate.aggregateId)
        .where('agg_version', '>', expectedVersion)
        .limit(1).get()
      if (!check.empty) throw Err.concurrency()

      let version = await getStreamVersion(eventsRef)
      const events = []
      for (let event of aggregate._uncommitted_events_) {
        const eventId = Padder.pad(++version)
        const eventObject = event.toObject(context, aggregate.aggregateId, ++expectedVersion, { id: version, time: new Date().toISOString() })
        await transaction.set(eventsRef.doc(eventId), eventObject)
        events.push(eventObject)
      }

      // save snapshot
      aggregate._aggregate_version_ = expectedVersion
      if (aggregateType.path) {
        const aggregateRef = this.firestore.collection(snapshotPath(actor.tenant, aggregateType.path)).doc(aggregate.aggregateId)
        await transaction.set(aggregateRef, aggregate.clone())
      }

      return events
    })
  }

  async pollStream (context, limit = 10) {
    const streamRef = this.firestore.doc(streamPath(context.tenant, context.stream))
    const threadRef = streamRef.collection('threads').doc(context.thread)
    const eventsRef = streamRef.collection('events')

    return await this.firestore.runTransaction(async transaction => {
      const doc = await threadRef.get()
      const thread = doc.data() || {}
  
      // skip if thread is currently leased
      const now = Date.now()
      if (thread.lease && (thread.lease.expiresAt || 0) > now) return null
  
      const threadCursors = Object.assign({}, thread.cursors)
      const cursors = {}

      // init cursors and get min version to poll
      const offset = context.handlers.reduce((offset, handler) => {
        const cursor = typeof threadCursors[handler.name] === 'undefined' ? -1 : threadCursors[handler.name]
        cursors[handler.name] = cursor
        return cursor < offset ? cursor : offset
      }, 1e9) + 1

      // load events
      const query = await eventsRef.where('id', '>=', offset).limit(limit + 1).get()
      if (!query.size) return null

      // save lease
      const events = query.docs.map(doc => new Event(doc.data()))
      await transaction.set(threadRef, { lease: { token: now, offset, expiresAt: Date.now() + context.timeout }}, { merge: true })
      return new Lease({ token: now, cursors, events, offset })
    })
  }

  async commitCursors(context, lease) {
    if (!lease.events.length) return false
    const streamRef = this.firestore.doc(streamPath(context.tenant, context.stream))
    const threadRef = streamRef.collection('threads').doc(context.thread)
    
    return await this.firestore.runTransaction(async transaction => {
      const doc = await transaction.get(threadRef)
      const thread = doc.data() || {}

      // commit when lease matches
      if (!(thread.lease && thread.lease.token === lease.token)) Err.concurrency()
      thread.cursors = Object.assign({}, thread.cursors, lease.cursors)
      thread.lease = {}
      await transaction.set(threadRef, thread, { merge: true })
      return thread
    })
    // await logStream('commit', context, streamRef)
  }
}
