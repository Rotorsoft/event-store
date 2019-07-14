'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Err = require('../Err')
const { pad } = require('../Padder')
const Lease = require('../Lease')

const SPROCS = {
  startLease: {
    id: "startLease",
    body: function startLease (threadId, offset, timeout) {
      const result = __.filter(doc => doc.id === threadId, (err, items) => {
        if (err) throw err

        // skip if thread is currently leased
        const thread = items.length ? items[0] : { id: threadId }
        const now = Date.now()
        if (thread.lease && (thread.lease.expiresAt || 0) > now) return

        // create lease
        thread.lease = { token: now, offset, expiresAt: now + timeout }
        const upsert_result = __.upsertDocument(__.getSelfLink(), thread, err => {
          if (err) throw err
          getContext().getResponse().setBody(thread)
        })
        if (!upsert_result) throw "startLease upsert not accepted"
      })
      if (!result.isAccepted) throw "startLease not accepted"
    }
  },
  endLease: {
    id: "endLease",
    body: function endLease (threadId, lease) {
      const result = __.filter(doc => doc.id === threadId, (err, items) => {
        if (err) throw err

        // commit when lease matches
        const thread = items.length ? items[0] : {}
        if (!(thread.lease && thread.lease.token === lease.token)) throw "Thread not found or leased by other reader"

        // end lease
        thread.cursors = Object.assign({}, thread.cursors, lease.cursors)
        thread.lease = {}
        const upsert_result = __.upsertDocument(__.getSelfLink(), thread, err => {
          if (err) throw err
          getContext().getResponse().setBody(thread)
        })
        if (!upsert_result) throw "endLease upsert not accepted"
      })
      if (!result.isAccepted) throw "endLease not accepted"
    }
  }
}

const EVENTS_PARTITION_KEY = { kind: "Hash", paths: ["/aid"] }
const SNAPS_PARTITION_KEY = { kind: "Hash", paths: ["/id"] }
const THREADS_PARTITION_KEY = { kind: "Hash", paths: ["/id"] }

const getSproc = async (container, sp) => {
  try {
    const { sproc } = await container.storedProcedure(sp.id).read()
    return sproc
  } catch (error) {
    if (error.code = '404') {
      const { sproc } = await container.storedProcedures.create(sp)
      return sproc
    }
    throw error
  }
}

module.exports = class CosmosDbEventStore extends IEventStore {
  constructor (cosmos) {
    super()
    this.cosmos = cosmos
    Object.freeze(this)
  }

  async getContainer (tenant, id, partitionKey) {
    const { database } = await this.cosmos.databases.createIfNotExists({ id: tenant })
    const { container } = await database.containers.createIfNotExists({ id, partitionKey })
    return container
  }

  async loadItem (container, id) {
    const query = {
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }]
    }
    const { result } = await container.items.query(query).toArray()
    return result.length ? result[0] : {}
  }

  async loadEvents (container, aggregateId, offset) {
    const query = {
      query: 'SELECT * FROM c WHERE c.aid = @aid AND c.id > @offset ORDER BY c.id',
      parameters: [
        { name: '@aid', value: aggregateId },
        { name: '@offset', value: offset }
      ]
    }
    const { result } = await container.items.query(query).toArray()
    return result
  }

  async getContainers (context) {
    context.events_container = context.events_container || await this.getContainer(context.actor.tenant, 'events', EVENTS_PARTITION_KEY)
    if (context.aggregateType.snapshot) context.snaps_container = context.snaps_container || await this.getContainer(context.actor.tenant, 'snapshots', SNAPS_PARTITION_KEY)
  }

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const { aggregateType } = context
    await this.getContainers(context)

    if (aggregateId) {
      // load snapshot
      const doc = context.snaps_container ? await this.loadItem(context.snaps_container, aggregateId) : {}
      const aggregate = Aggregate.create(aggregateType, doc.payload || { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const envelopes = await this.loadEvents(context.events_container, aggregateId, pad(aggregate.aggregateVersion))
        if (!envelopes.length) break
        aggregate._replay(envelopes)
        expectedVersion = Math.max(expectedVersion, aggregate.aggregateVersion)
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: aggregateType.name.concat('-', Date.now().toString()) })
  }

  async commitEvents (context, expectedVersion = -1) {
    const { aggregateType, aggregate } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()
    await this.getContainers(context)

    try {
      await context.events_container.items.create(context._envelope)
      aggregate._aggregate_version_++
    } catch (error) {
      throw Err.concurrency()
    }

    // save snapshot
    if (context.snaps_container) {
      try {
        const snapshot = {
          id: aggregate._aggregate_id_,
          type: aggregateType.name,
          payload: aggregate.clone()
        }
        await context.snaps_container.items.upsert(snapshot)
      } catch (error) {
        console.error(error)
      }
    }
  }

  async pollEvents (container, offset, limit) {
    const query = {
      query: 'SELECT TOP @limit * FROM c WHERE c.gid > @offset ORDER BY c.gid',
      parameters: [
        { name: '@offset', value: offset },
        { name: '@limit', value: limit }
      ]
    }
    const { result } = await container.items.query(query, { enableCrossPartitionQuery: true }).toArray()
    return result
  }

  async pollStream (context, limit = 10) {
    context.threads_container = await this.getContainer(context.tenant, 'threads', THREADS_PARTITION_KEY)
    const thread = await this.loadItem(context.threads_container, context.thread)
    if (thread.lease && (thread.lease.expiresAt || 0) > Date.now()) return // skip if thread is currently leased

    // init cursors and get min offset to poll
    const threadCursors = Object.assign({}, thread.cursors)
    const cursors = {}
    const offset = context.handlers.reduce((offset, handler) => {
      const cursor = threadCursors[handler.name] || '0'
      cursors[handler.name] = cursor
      return cursor < offset ? cursor : offset
    }, 'END')

    // load events
    const events_container = await this.getContainer(context.tenant, 'events', EVENTS_PARTITION_KEY)
    const envelopes = await this.pollEvents(events_container, offset, limit + 1)
    if (!envelopes.length) return null

    // start lease
    const sp = await getSproc(context.threads_container, SPROCS.startLease)
    const { body } = await sp.execute([context.thread, offset, context.timeout], { partitionKey: context.thread })
    return new Lease({ token: body.lease.token, cursors, envelopes, offset })
  }

  async commitCursors(context, lease) {
    if (!lease.envelopes.length) return false
    const sp = await getSproc(context.threads_container, SPROCS.endLease)
    const { body } = await sp.execute([context.thread, lease], { partitionKey: context.thread })
    return body
  }
}