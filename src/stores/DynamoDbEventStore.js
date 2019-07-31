'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Err = require('../Err')
const { pad } = require('../Padder')
const Lease = require('../Lease')

module.exports = class DynamoDbEventStore extends IEventStore {
  constructor (dynamo) {
    super()
    this.dynamo = dynamo
    Object.freeze(this)
  }

  async loadAggregate (context, aggregateId, expectedVersion = -1) {
    const { actor, aggregateType } = context

    if (aggregateId) {
      // load snapshot
      const snap_params = {
        TableName: actor.tenant.concat('_snapshots'),
        Key: { 'id': aggregateId }
      }
      const doc = aggregateType.snapshot ? await this.dynamo.get(snap_params).promise() : null
      const aggregate = Aggregate.create(aggregateType, doc && doc.Item ? doc.Item.payload : { _aggregate_id_: aggregateId, _aggregate_version_: -1 })
      
      // load events that ocurred after snapshot was taken
      while (expectedVersion === -1 || aggregate.aggregateVersion < expectedVersion) {
        const query_params = {
          TableName: actor.tenant.concat('_events'),
          KeyConditionExpression: "aid = :aid and id > :id",
          ExpressionAttributeValues: { ':aid': aggregateId, ':id': pad(aggregate.aggregateVersion) }
        }
        const envelopes = await this.dynamo.query(query_params).promise()
        if (!envelopes.Count) break
        aggregate._replay(envelopes.Items)
      }
      return aggregate
    }
    // return new aggregate with auto generated id
    return Aggregate.create(aggregateType, { _aggregate_id_: Date.now().toString() })
  }

  async commitEvents (context, expectedVersion = -1) {
    const { aggregateType, actor, aggregate } = context
    if (aggregate.aggregateVersion !== expectedVersion) throw Err.concurrency()

    try {
      const envelope = context._envelope
      const params = {
        TableName: actor.tenant.concat('_events'),
        Item: Object.assign({ grp: envelope.gid.substr(0, 4) }, envelope), // add property for global event replaying
        ConditionExpression: 'attribute_not_exists(id)'
      }
      await this.dynamo.put(params).promise()
      aggregate._aggregate_version_++
    } catch (error) {
      throw Err.concurrency()
    }
    // save snapshot
    if (aggregateType.snapshot) {
      try {
        const params = {
          TableName: actor.tenant.concat('_snapshots'),
          Item: {
            'id' : aggregate.aggregateId,
            'payload' : aggregate.clone()
          }
        }
        await this.dynamo.put(params).promise()
      } catch (error) {
        console.error(error)
      }
    }
  }

  async pollStream (context, limit = 10) {
    let lease = null
    try {
      const params = {
        TableName: context.tenant.concat('_threads'),
        Key: { 'id': context.thread }
      }
      const doc = await this.dynamo.get(params).promise()
      const thread = doc.Item || { id: context.thread }

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
      const query_params = {
        TableName: context.tenant.concat('_events'),
        IndexName: 'gid',
        Limit: limit + 1,
        KeyConditionExpression: "grp = :grp and gid > :offset",
        ExpressionAttributeValues: { ':grp': new Date().getFullYear().toString(), ':offset': offset }
      }
      const envelopes = await this.dynamo.query(query_params).promise()
      if (envelopes.Count) {
        thread.lease = { token_: now, offset, expiresAt: Date.now() + context.timeout }
        const params = {
          TransactItems: [{
            Put: {
              TableName: context.tenant.concat('_threads'),
              Item: thread,
              ConditionExpression: 'attribute_not_exists(lease) or (lease.expiresAt < :now)',
              ExpressionAttributeValues: { ':now': now }
            }
          }]
        }
        await this.dynamo.transactWrite(params).promise()

        lease = new Lease({ token: now, cursors, envelopes: envelopes.Items, offset })
      }
    } catch (error) {
      console.log(error)
      return null
    }
    return lease
  }

  async commitCursors(context, lease) {
    if (!lease.envelopes.length) return false
    
    const params = {
      TableName: context.tenant.concat('_threads'),
      Key: { 'id': context.thread }
    }
    const doc = await this.dynamo.get(params).promise()
    const thread = doc.Item

    // commit when lease matches
    if (!(thread && thread.lease && thread.lease.token_ === lease.token)) Err.concurrency()
    try {
      thread.cursors = Object.assign({}, thread.cursors, lease.cursors)
      thread.lease = { expiresAt: 0 }
      const params = {
        TransactItems: [{
          Put: {
            TableName: context.tenant.concat('_threads'),
            Item: thread,
            ConditionExpression: 'lease.token_ = :token',
            ExpressionAttributeValues: { ':token': lease.token }
          }
        }]
      }
      await this.dynamo.transactWrite(params).promise()
    } catch (error) {
      console.log(error)
      Err.concurrency()
    }
  }
}
