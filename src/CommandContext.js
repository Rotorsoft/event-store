'use strict'

const Aggregate = require('./Aggregate')
const Err = require('./Err')
const { pad } = require('./Padder')

module.exports = class CommandContext {
  /**
   * Command context factory
   * 
   * @param {Object} commands The map of supported commands
   * @param {CommandHandler} handler The command handler
   * @param {Actor} actor The actor sending this command
   * @param {String} command The command name
   * @param {String} aggregateId The aggregate id
   * @param {Number} expectedVersion The expected aggregate version
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
    Object.defineProperty(ctx, 'events', { value: [], writable: false, enumerable: false })
    return ctx
  }

  /**
   * Gets current state of context envelope
   */
  get _envelope () {
    const id = pad((this.aggregate ? this.aggregate.aggregateVersion : this.expectedVersion) + 1)
    return Object.freeze({
      id,
      aid: this.aggregate ? this.aggregate.aggregateId : this.aggregateId,
      gid: new Date().toISOString().concat('.', id),
      command: this.command,
      actor: Object.assign({}, this.actor),
      events: this.events
    })
  }

  /**
   * Handles and pushes new event into context's envelope
   * 
   * @param {String} name The event name
   * @param {Object} payload The optional event payload (context.payload by default)
   * @param {Number} version The optional event version (0 by default)
   */
  push (name, payload = null, version = 0) {
    Err.required('name', name)
    if (this.aggregate) {
      const event = Object.freeze({ name, version, payload: payload || this.payload })
      this.aggregate.events[name](event)
      this.events.push(event)
    }
  }

  /**
   * Loads aggregate from store
   * 
   * @param {Type} aggregateType The aggregate type to load
   * @param {String} aggregateId The aggregate id to load
   * @param {Number} expectedVersion The expected version or -1 to load the latest version available
   * @returns The loaded aggregate or null
   */
  async load (aggregateType, aggregateId, expectedVersion = -1) {
    Err.required('aggregateType', aggregateType.prototype, Aggregate)
    Err.required('aggregateId', aggregateId)
    Err.required('expectedVersion', expectedVersion, 'number')

    const ctx = new CommandContext()
    Object.defineProperty(ctx, 'actor', { value: this.actor, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'aggregateType', { value: aggregateType, writable: false, enumerable: true })
    return await this.handler._store_.loadAggregate(ctx, aggregateId, expectedVersion)
  }
}