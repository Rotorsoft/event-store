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
   * Polls stream for new unhandled events under given thread.
   * Every thread commits a map of cursors (last handled event offset) after succesfull handling of events.
   * A reader can concurrently poll a stream from multiple threads with any number of handlers.
   * Handlers must be idempotent.
   * 
   * @param {String} tenant The tenant id
   * @param {String} thread The thread name (key to store cursors)
   * @param {Array} handlers The array of event handlers
   * @param {Number} limit The max number of events to poll
   * @param {Number} timeout The timeout in milliseconds to expire lease
   * @returns True if there are more events in stream
   */
  async poll (tenant, thread, handlers, { limit = 10, timeout = 10000 } = {}) {
    Err.required('tenant', tenant)
    Err.required('thread', thread)
    Err.required('handlers', handlers, 'array')
    const validHandlers = handlers.filter(handler => {
      return (handler instanceof IEventHandler) && handler.name
    })
    if (!validHandlers.length) return false

    const context = new ReaderContext({ tenant, thread, handlers: validHandlers, timeout })
    const lease = await this._store_.pollStream(context, limit)
    this._tracer_.trace(() => ({ method: 'pollStream', lease }))
    if (lease && lease.events.length) {
      const min = Math.min(lease.events.length, limit)
      for (let i = 0; i < min; i++) {
        let event = lease.events[i]
        for (let handler of context.handlers) {
          if (lease.cursors[handler.name] < event.gid) {
            try {
              this._tracer_.trace(() => ({ method: 'handle', handler: handler.name, tenant, thread, event }))
              await handler.handle(tenant, event)
              lease.cursors[handler.name] = event.gid
            }
            catch (e) {
              this._tracer_.trace(() => ({ error: e }))
            }
          }
        }
      }
      const result = await this._store_.commitCursors(context, lease)
      this._tracer_.trace(() => ({ method: 'commitCursors', context, result }))
      return lease.events.length > limit
    }
    return false
  }
}
