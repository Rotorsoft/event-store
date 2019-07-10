'use strict'

module.exports = class ReaderContext {
  /**
   * Reader context constructor
   * 
   * @param {String} tenant The tenant id
   * @param {String} thread The thread name
   * @param {Array} handlers Array of event handlers
   * @param {Number} timeout The timeout in millis to expire lease
   */
  constructor ({ tenant, thread, handlers, timeout }) {
    this.tenant = tenant
    this.thread = thread
    this.handlers = handlers
    this.timeout = timeout
    Object.freeze(this)
  }
}
