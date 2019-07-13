'use strict'

module.exports = class ReaderContext {
  /**
   * Reader context factory
   * 
   * @param {String} tenant The tenant id
   * @param {String} thread The thread name
   * @param {Array} handlers Array of event handlers
   * @param {Number} timeout The timeout in millis to expire lease
   */
  static create ({ tenant, thread, handlers, timeout }) {
    const ctx = new ReaderContext()
    Object.defineProperty(ctx, 'tenant', { value: tenant, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'thread', { value: thread, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'handlers', { value: handlers, writable: false, enumerable: true })
    Object.defineProperty(ctx, 'timeout', { value: timeout, writable: false, enumerable: true })
    return ctx
  }
}
