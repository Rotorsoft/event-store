'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Err = require('../Err')
const { pad } = require('../Padder')
const Lease = require('../Lease')

module.exports = class MongoDbEventStore extends IEventStore {
  constructor (mongo) {
    super()
    this.mongo = mongo
    Object.freeze(this)
  }

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const { actor, aggregateType } = context
    context._db = this.mongo.db(actor.tenant)
    const events_collection = context._db.collection('events')
    const snaps_collection = context._db.collection('snapshots')

    if (aggregateId) {
      // load snapshot
      const doc = aggregateType.snapshot ? await snaps_collection.find({ _id: aggregateId }).toArray() : null
      const aggregate = Aggregate.create(aggregateType, doc && doc.length ? doc[0] : { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const envelopes = await events_collection.find({ aid: aggregateId, id: { $gt: pad(aggregate.aggregateVersion) }}).toArray()
        if (!envelopes.length) break
        aggregate._replay(envelopes)
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: Date.now().toString() })
  }

  async commitEvents (context, expectedVersion = -1) {
    const { aggregateType, actor, aggregate } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()
    context._db = context._db || this.mongo.db(actor.tenant)

    try {
      const envelope = context._envelope
      const _id = aggregate.aggregateId.concat('.', envelope.id)
      await context._db.collection('events').insertOne(Object.assign({}, envelope, { _id }))
      aggregate._aggregate_version_++
    } catch (error) {
      throw Err.concurrency()
    }
    // save snapshot
    if (aggregateType.snapshot) {
      try {
        await context._db.collection('snapshots').updateOne(
          { _id: aggregate.aggregateId },
          { $set: aggregate.clone() },
          { upsert: true }
        )
      } catch (error) {
        console.error(error)
      }
    }
  }

  async pollStream (context, limit = 10) {
    context._db = this.mongo.db(context.tenant)
    const events_collection = context._db.collection('events')
    const threads_collection = context._db.collection('threads')

    let lease = null
    const session = this.mongo.startSession( { readPreference: { mode: "primary" } } )
    session.startTransaction( { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } } )
    try {
      const doc = await threads_collection.find({ _id: context.thread }).toArray()
      const thread = doc.length ? doc[0] : {}

      // skip if thread is currently leased
      const now = Date.now()
      if (!(thread.lease && (thread.lease.expiresAt || 0) > now)) {
        // init cursors and get min version to poll
        const threadCursors = Object.assign({}, thread.cursors)
        const cursors = {}
        const offset = context.handlers.reduce((offset, handler) => {
          const cursor = threadCursors[handler.name] || '0'
          cursors[handler.name] = cursor
          return cursor < offset ? cursor : offset
        }, 'END')

        // load events
        const envelopes = await events_collection.find({ gid: { $gt: offset }}).sort( { gid: 1 }).limit(limit + 1).toArray()
        if (envelopes.length) {
          await threads_collection.updateOne({ _id: context.thread }, { $set: { lease: { token: now, offset, expiresAt: Date.now() + context.timeout }}}, { upsert: true })
          lease = new Lease({ token: now, cursors, envelopes, offset })
        }
      }
    } catch (error) {
      await session.abortTransaction()
      throw error
    }
    await session.commitTransaction()
    session.endSession()
    return lease
  }

  async commitCursors(context, lease) {
    if (!lease.envelopes.length) return false
    const threads_collection = context._db.collection('threads')
    
    const session = this.mongo.startSession( { readPreference: { mode: "primary" } } )
    session.startTransaction( { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } } )
    try {
      const doc = await threads_collection.find({ _id: context.thread }).toArray()
      const thread = doc.length ? doc[0] : {}

      // commit when lease matches
      if (!(thread.lease && thread.lease.token === lease.token)) Err.concurrency()

      thread.cursors = Object.assign({}, thread.cursors, lease.cursors)
      thread.lease = {}
      await threads_collection.updateOne({ _id: context.thread }, { $set: thread })
    } catch (error) {
      await session.abortTransaction()
      throw error
    }
    await session.commitTransaction()
    session.endSession()
  }
}
