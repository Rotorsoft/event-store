'use strict'

const ITracer = require('./ITracer')
const IEventStore = require('./IEventStore')
const Aggregate = require('./Aggregate')
const SimpleCache = require('./SimpleCache')
const Err = require('./Err')
const Actor = require('./Actor')
const CommandContext = require('./CommandContext')

/**
 * Handles commands
 */
module.exports = class CommandHandler {
  /**
   * Constructor
   * 
   * @param {IEventStore} store The event store
   * @param {Aggregate[]} aggregates Array of aggregates supported by this instance
   * @param {ITracer} tracer Tracer module
   * @param {Number} CACHE_SIZE Size of aggregates cache
   */
  constructor (store, aggregates, tracer = null, CACHE_SIZE = 10) {
    tracer = tracer || new ITracer()
    Err.required('store', store, IEventStore)
    Err.required('aggregates', aggregates, 'array')
    Err.required('tracer', tracer, ITracer)
    this._store_ = store
    this._tracer_ = tracer
    this._cache_ = new SimpleCache(CACHE_SIZE)
    this._commands_ = {}
    aggregates.forEach(aggregateType => {
      Err.required('aggregateType', aggregateType.prototype, Aggregate)
      const aggregate = Aggregate.create(aggregateType)
      for(let command of Object.keys(aggregate.commands)) {
        this._commands_[command] = aggregateType
      }
    })
    Object.freeze(this)
  }

  /**
   * Command Handler
   * 
   * @param {Actor} actor The user/process sending command
   * @param {String} command The command name
   * @param {Object} payload The command payload including aggregateId and expectedVersion
   * @returns {CommandContext} command context with response
   */
  async command (actor, command, { aggregateId = '', expectedVersion = -1, ...payload } = {}) {
    Err.required('actor', actor, Actor)
    Err.required('command', command)
    if (expectedVersion >= 0 && !aggregateId) throw Err.missingArgument('aggregateId')
    
    // create command context
    const context = CommandContext.create(this._commands_, { handler: this, actor, command, aggregateId, expectedVersion, payload })
    this._tracer_.trace(() => ({ method: 'command', context }))

    // try loading aggregate from cache first
    if (aggregateId && expectedVersion >= 0) {
      const copy = this._cache_.get(aggregateId)
      if (copy) {
        context.aggregate = Aggregate.create(context.aggregateType, copy)
        context.cached = true
      }
    }

    // load from store if not found in cache or incorrect version
    if (!(context.aggregate && context.aggregate._aggregate_version_ === expectedVersion)) {
      context.aggregate = await this._store_.loadAggregate(context, aggregateId, expectedVersion)
      context.cached = false
      this._tracer_.trace(() => ({ method: 'loadAggregate', context }))
    }
  
    // handle command
    await context.aggregate.commands[command](context)

    if (context.events.length) {
      // assume user wants to act on latest version when not provided
      if (expectedVersion === -1) expectedVersion = context.aggregate._aggregate_version_

      // commit events
      await this._store_.commitEvents(context, expectedVersion)
      this._tracer_.trace(() => ({ method: 'commitEvents', context }))

      // cache aggregate
      this._cache_.set(context.aggregate.aggregateId, context.aggregate.clone())
    }

    return context
  }
}
