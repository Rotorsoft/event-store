'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Err = require('../Err')
const { pad } = require('../Padder')
const Lease = require('../Lease')

const eventsPath = tenant => '/tenants/'.concat(tenant, '/events')
const snapshotsPath = tenant => '/tenants/'.concat(tenant, '/snapshots')
const threadsPath = tenant => '/tenants/'.concat(tenant, '/threads')

module.exports = class FirestoreEventStore extends IEventStore {
  constructor (firestore) {
    super()
    this.firestore = firestore
    Object.freeze(this)
  }

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const { actor, aggregateType } = context
    const collRef = this.firestore.collection(snapshotsPath(actor.tenant))
    if (aggregateId) {
      // load snapshot
      const doc = aggregateType.snapshot ? await collRef.doc(aggregateId).get() : null
      const aggregate = Aggregate.create(aggregateType, doc && doc.exists ? doc.data() : { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      const eventsRef = this.firestore.collection(eventsPath(actor.tenant))
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const envelopes = await eventsRef.where('aid', '==', aggregateId).where('id', '>', pad(aggregate.aggregateVersion)).get()
        if (!envelopes.size) break
        aggregate._replay(envelopes.docs.map(envelope => envelope.data()))
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: collRef.doc().id })
  }

  async commitEvents (context, expectedVersion = -1) {
    const { actor, aggregateType, aggregate } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()

    try {
      const envelope = context._envelope
      const docid = aggregate.aggregateId.concat('.', envelope.id) // firestore id
      await this.firestore.collection(eventsPath(actor.tenant)).doc(docid).create(envelope)
      aggregate._aggregate_version_++
    } catch (error) {
      throw Err.concurrency()
    }
    // save snapshot
    if (aggregateType.snapshot) {
      try {
        await this.firestore.collection(snapshotsPath(actor.tenant)).doc(aggregate.aggregateId).set(aggregate.clone())
      } catch (error) {
        console.error(error)
      }
    }
  }

  async pollStream (context, limit = 10) {
    const threadRef = this.firestore.collection(threadsPath(context.tenant)).doc(context.thread)

    return await this.firestore.runTransaction(async transaction => {
      const doc = await threadRef.get()
      const thread = doc.data() || {}
  
      // skip if thread is currently leased
      const now = Date.now()
      if (thread.lease && (thread.lease.expiresAt || 0) > now) return null
  
      // init cursors and get min version to poll
      const threadCursors = Object.assign({}, thread.cursors)
      const cursors = {}
      const offset = context.handlers.reduce((offset, handler) => {
        const cursor = threadCursors[handler.name] || '0'
        cursors[handler.name] = cursor
        return cursor < offset ? cursor : offset
      }, 'END')

      // load events
      const query = await this.firestore.collection(eventsPath(context.tenant)).where('gid', '>', offset).limit(limit + 1).get()
      if (!query.size) return null

      // save lease
      const envelopes = query.docs.map(doc => doc.data())
      await transaction.set(threadRef, { lease: { token: now, offset, expiresAt: Date.now() + context.timeout }}, { merge: true })
      return new Lease({ token: now, cursors, envelopes, offset })
    })
  }

  async commitCursors(context, lease) {
    if (!lease.envelopes.length) return false
    const threadRef = this.firestore.collection(threadsPath(context.tenant)).doc(context.thread)
    
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
  }
}
