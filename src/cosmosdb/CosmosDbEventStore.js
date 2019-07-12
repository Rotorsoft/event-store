'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Event = require('../Event')
const Err = require('../Err')
const { pad } = require('../Padder')
const Lease = require('../Lease')

const SPROCS = {
  commitEvents: {
    id: "commitEvents",
    body: function commitEvents (events) {
      const insertEvent = async event => {
        return new Promise(resolve => {
          const accept = __.createDocument(__.getSelfLink(), event, (err, item) => {
            if (err) throw err
            resolve(item)
          })
          if (!accept) throw 'commitEvents not accepted'
        })
      }
      const insertEvents = async events => {
        const results = []
        for (let event of events) {
          results.push(await insertEvent(event))
        }
        return results
      }
      return insertEvents(events).then(results => getContext().getResponse().setBody(results))
    }
  },
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

const getContainer = async (cosmos, tenant, id, partitionKey) => {
  const { database } = await cosmos.databases.createIfNotExists({ id: tenant })
  const { container } = await database.containers.createIfNotExists({ id, partitionKey })
  return container
}

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

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const { aggregateType } = context
    if (aggregateId) {
      const e_container = await getContainer(this.cosmos, context.actor.tenant, 'events', EVENTS_PARTITION_KEY)
      const s_container = aggregateType.snapshot ? await getContainer(this.cosmos, context.actor.tenant, 'snapshots', SNAPS_PARTITION_KEY) : null

      // load snapshot
      const doc = s_container ? await this.loadItem(s_container, aggregateId) : {}
      const aggregate = Aggregate.create(aggregateType, doc.payload || { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const items = await this.loadEvents(e_container, aggregateId, pad(aggregate.aggregateVersion))
        if (!items.length) break
        items.forEach(item => aggregate._replay(new Event(item)))
        expectedVersion = Math.max(expectedVersion, aggregate.aggregateVersion)
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: aggregateType.name.concat('-', Date.now().toString()) })
  }

  async commitEvents (context, aggregate, expectedVersion = -1) {
    const { aggregateType } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()

    // commit events
    const stamps = aggregate._uncommitted_events_.map(event => event.stamp(pad(++expectedVersion), aggregate.aggregateId, context))
    const e_container = await getContainer(this.cosmos, context.actor.tenant, 'events', EVENTS_PARTITION_KEY)
    const s_container = aggregateType.snapshot ? await getContainer(this.cosmos, context.actor.tenant, 'snapshots', SNAPS_PARTITION_KEY) : null

    const sp = await getSproc(e_container, SPROCS.commitEvents)
    try {
      const { body } = await sp.execute([stamps], { partitionKey: aggregate.aggregateId })
    } catch (error) {
      throw Err.concurrency()
    }
    aggregate._aggregate_version_ = expectedVersion

    // save snapshot
    if (s_container) {
      const snapshot = {
        id: aggregate._aggregate_id_,
        type: aggregateType.name,
        payload: aggregate.clone()
      }
      await s_container.items.upsert(snapshot)
    }

    return stamps
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
    const t_container = await getContainer(this.cosmos, context.tenant, 'threads', THREADS_PARTITION_KEY)
    const thread = await this.loadItem(t_container, context.thread)

    // skip if thread is currently leased
    const now = Date.now()
    if (thread.lease && (thread.lease.expiresAt || 0) > now) return

    // init cursors and get min version to poll
    const threadCursors = Object.assign({}, thread.cursors)
    const cursors = {}
    const offset = context.handlers.reduce((offset, handler) => {
      const cursor = threadCursors[handler.name] || '0'
      cursors[handler.name] = cursor
      return cursor < offset ? cursor : offset
    }, 'END')

    // load events
    const e_container = await getContainer(this.cosmos, context.tenant, 'events', EVENTS_PARTITION_KEY)
    const events = await this.pollEvents(e_container, offset, limit + 1)
    if (!events.length) return null

    // start lease
    const sp = await getSproc(t_container, SPROCS.startLease)
    const { body } = await sp.execute([context.thread, offset, context.timeout], { partitionKey: context.thread })
    return new Lease({ token: body.lease.token, cursors, events: events, offset })
  }

  async commitCursors(context, lease) {
    if (!lease.events.length) return false
    const t_container = await getContainer(this.cosmos, context.tenant, 'threads', THREADS_PARTITION_KEY)
    const sp = await getSproc(t_container, SPROCS.endLease)
    const { body } = await sp.execute([context.thread, lease], { partitionKey: context.thread })
    return body
  }
}