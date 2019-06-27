'use strict'

const ITracer = require('./ITracer')
const IEventStore = require('./IEventStore')
const IEventHandler = require('./IEventHandler')
const Err = require('./Err')
const ReaderContext = require('./ReaderContext')

/**
 * Event Stream Reader
 */
module.exports = class StreamReader {
  /**
   * Constructor
   * 
   * @param {IEventStore} store The event store
   * @param {ITracer} tracer The tracer
   */
  constructor (store, tracer = null) {
    tracer = tracer || new ITracer()
    Err.required('store', store, IEventStore)
    Err.required('tracer', tracer, ITracer)
    this._store_ = store
    this._tracer_ = tracer
    Object.freeze(this)
  }

  /**
   * Polls stream, handles new events, and commits cursors
   * 
   * @param {String} tenant The tenant id
   * @param {String} stream The stream name
   * @param {Array} handlers The array of event handlers
   * @param {Integer} limit The max number of events to poll
   * @param {Integer} timeout The timeout in milliseconds to expire lease
   * @returns True if any of the handlers is still behind
   */
  async poll (tenant, stream, handlers, { limit = 10, timeout = 10000 } = {}) {
    Err.required('tenant', tenant)
    Err.required('stream', stream)
    Err.required('handlers', handlers, 'array')
    const validHandlers = handlers.filter(handler => {
      return (handler instanceof IEventHandler) && handler.name && handler.stream === stream
    })
    if (!validHandlers.length) return false

    const context = new ReaderContext({ tenant, stream, handlers: validHandlers, timeout })
    const lease = await this._store_.pollStream(context, limit)
    this._tracer_.trace(() => ({ method: 'pollStream', lease }))
    if (lease && lease.events.length) {
      for (let i = 0; i < lease.events.length; i++) {
        let event = lease.events[i]
        let offset = lease.offset + i
        for (let handler of context.handlers) {
          if (offset === lease.cursors[handler.name] + 1) {
            try {
              this._tracer_.trace(() => ({ method: 'handle', handler: handler.name, tenant, stream, event, offset }))
              await handler.handle(tenant, event)
              lease.cursors[handler.name] = offset
            }
            catch (e) {
              this._tracer_.trace(() => ({ error: e }))
            }
          }
        }
      }
      return await this._store_.commitCursors(context, lease)
    }
    return false
  }
}
