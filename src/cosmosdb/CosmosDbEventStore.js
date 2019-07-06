'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Event = require('../Event')
const Err = require('../Err')
const Padder = require('../Padder')
const Lease = require('../Lease')

const SPROCS = {
  commitEvents: {
    id: "commitEvents",
    body: function commitEvents (events) {
      let version = -1
      const insertEvent = async event => {
        const id = (++version).toString()
        event.type = 'event'
        event.id = '000000000'.substr(0, 9 - id.length).concat(id)
        return new Promise(resolve => {
          const accept = __.createDocument(__.getSelfLink(), event, (err, item) => {
            if (err) throw err
            resolve(item)
          })
          if (!accept) throw 'commitEvents create not accepted'
        })
      }
      const insertEvents = async events => {
        const results = []
        for (let event of events) {
          results.push(await insertEvent(event))
        }
        return results
      }
      const result = __.chain().filter(doc => doc.type === 'event').sortByDescending(doc => doc.id).value({ pageSize: 1 }, (err, items) => {
        if (err) throw err
        version = items.length ? Number.parseInt(items[0].id) : -1
        return insertEvents(events).then(results => getContext().getResponse().setBody(results))
      })
      if (!result.isAccepted) throw "commitEvents not accepted"
    }
  },
  startLease: {
    id: "startLease",
    body: function startLease (threadId, offset, timeout) {
      const result = __.filter(doc => doc.id === threadId, (err, items) => {
        if (err) throw err

        // skip if thread is currently leased
        const thread = items.length ? items[0] : { id: threadId, type: 'thread' }
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

const getContainer = async (cosmos, tenant, stream) => {
  const { database } = await cosmos.databases.createIfNotExists({ id: tenant })
  const { container } = await database.containers.createIfNotExists({ id: stream, partitionKey: { kind: "Hash", paths: ["/type"] }})
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

  async loadSnapshot (container, agg_path, agg_id) {
    const query = {
      query: 'SELECT * FROM c WHERE c.type = @path AND c.id = @id',
      parameters: [
        { name: '@path', value: agg_path },
        { name: '@id', value: agg_id }
      ]
    }
    const { result } = await container.items.query(query).toArray()
    return result.length ? result[0].payload : null
  }

  async loadEvents (container, agg_type, agg_id, agg_version) {
    const query = {
      query: 'SELECT * FROM c WHERE c.type = "event" AND c.agg_type = @agg_type AND c.agg_id = @agg_id AND c.agg_version > @agg_version ORDER BY c.id',
      parameters: [
        { name: '@agg_type', value: agg_type },
        { name: '@agg_id', value: agg_id },
        { name: '@agg_version', value: agg_version }
      ]
    }
    const { result } = await container.items.query(query).toArray()
    return result
  }

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const { aggregateType } = context
    if (aggregateId) {
      const container = await getContainer(this.cosmos, context.actor.tenant, aggregateType.stream)

      // load snapshot if path provided
      const doc = aggregateType.path ? await this.loadSnapshot(container, aggregateType.path, aggregateId) : null
      const aggregate = Aggregate.create(aggregateType, doc || { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const eventItems = await this.loadEvents(container, aggregateType.name, aggregateId, aggregate.aggregateVersion)
        
        // replay events
        eventItems.forEach(eventItem => {
          const event = new Event(eventItem)
          aggregate.events[eventItem.name](event)
          aggregate._aggregate_version_++
        })

        if (!eventItems.length) break
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: Date.now().toString() })
  }

  async commitEvents (context, aggregate, expectedVersion = -1) {
    const { aggregateType } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()

    // commit events
    const events = aggregate._uncommitted_events_.map(event => event.toObject(context, aggregate.aggregateId, ++expectedVersion, {}))
    const container = await getContainer(this.cosmos, context.actor.tenant, aggregateType.stream)
    const sp = await getSproc(container, SPROCS.commitEvents)
    const { body } = await sp.execute([events], { partitionKey: 'event' })
    aggregate._aggregate_version_ = expectedVersion

    // save snapshot
    if (aggregateType.path) {
      const snapshot = {
        id: aggregate._aggregate_id_,
        type: aggregateType.path,
        payload: aggregate.clone()
      }
      await container.items.upsert(snapshot)
    }

    return events
  }

  async loadThread (container, thread) {
    const query = {
      query: 'SELECT * FROM c WHERE c.type = "thread" AND c.id = @id',
      parameters: [{ name: '@id', value: thread }]
    }
    const { result } = await container.items.query(query).toArray()
    return result.length ? result[0] : {}
  }

  async pollEvents (container, offset, limit) {
    const query = {
      query: 'SELECT TOP @limit * FROM c WHERE c.type = "event" and c.id >= @offset ORDER BY c.id',
      parameters: [
        { name: '@offset', value: Padder.pad(offset) },
        { name: '@limit', value: limit }
      ]
    }
    const { result } = await container.items.query(query).toArray()
    return result
  }

  async pollStream (context, limit = 10) {
    const container = await getContainer(this.cosmos, context.tenant, context.stream)
    const thread = await this.loadThread(container, context.thread)

    // skip if thread is currently leased
    const now = Date.now()
    if (thread.lease && (thread.lease.expiresAt || 0) > now) return

    // init cursors and get min version to poll
    const threadCursors = Object.assign({}, thread.cursors)
    const cursors = {}
    const offset = context.handlers.reduce((offset, handler) => {
      const cursor = typeof threadCursors[handler.name] === 'undefined' ? -1 : threadCursors[handler.name]
      cursors[handler.name] = cursor
      return cursor < offset ? cursor : offset
    }, 1e9) + 1

    // load events
    const events = await this.pollEvents(container, offset, limit + 1)
    if (!events.length) return null

    // start lease
    const sp = await getSproc(container, SPROCS.startLease)
    const { body } = await sp.execute([context.thread, offset, context.timeout], { partitionKey: 'thread' })
    return new Lease({ token: body.lease.token, cursors, events, offset })
  }

  async commitCursors(context, lease) {
    if (!lease.events.length) return false
    const container = await getContainer(this.cosmos, context.tenant, context.stream)
    const sp = await getSproc(container, SPROCS.endLease)
    const { body } = await sp.execute([context.thread, lease], { partitionKey: 'thread' })
    return body
  }
}