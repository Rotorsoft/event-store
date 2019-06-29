'use strict'

const Aggregate = require('./Aggregate')
const Err = require('./Err')

module.exports = class CommandContext {
  /**
   * Command context factory
   * 
   * @param {Object} commands The map of supported commands
   * @param {CommandHandler} handler The command handler
   * @param {Actor} actor The actor sending this command
   * @param {String} command The command name
   * @param {String} aggregateId The aggregate id
   * @param {Integer} expectedVersion The expected aggregate version
   * @param {Object} payload The command payload
   * @returns {CommandContext} The command context
   */
  static create (commands, { handler, actor, command, aggregateId, expectedVersion, payload }) {
    const aggregateType = commands[command]
    if (!aggregateType) throw Err.invalidArgument('command')
    const ctx = new CommandContext()
    Object.defineProperty(ctx, 'handler', { value: handler, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'actor', { value: actor, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'command', { value: command, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'aggregateType', { value: aggregateType, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'aggregateId', { value: aggregateId, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'expectedVersion', { value: expectedVersion, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'payload', { value: Object.freeze(payload), writable: false, enumerable: true })
    return ctx
  }

  /**
   * Loads aggregate from store
   * 
   * @param {Type} aggregateType The aggregate type to load
   * @param {String} aggregateId The aggregate id to load
   * @param {Integer} expectedVersion The expected version or -1 to load the latest version available
   * @returns The loaded aggregate or null
   */
  async load (aggregateType, aggregateId, expectedVersion = -1) {
    Err.required('aggregateType', aggregateType, 'function')
    Err.required('aggregateType', aggregateType.prototype, Aggregate)
    Err.required('aggregateId', aggregateId)
    Err.required('expectedVersion', expectedVersion, 'number')
    
    const ctx = new CommandContext()
    ctx.actor = this.actor
    ctx.aggregateType = this.aggregateType
    Object.freeze(ctx)
    return await this.handler._store_.loadAggregate(ctx, aggregateId, expectedVersion)
  }
}