'use strict'

module.exports = class ReaderContext {
  /**
   * Reader context constructor
   * 
   * @param {String} tenant The tenant id
   * @param {String} stream The stream name
   * @param {String} thread The thread name
   * @param {Array} handlers Array of event handlers
   * @param {Number} timeout The timeout in millis to expire lease
   */
  constructor ({ tenant, stream, thread, handlers, timeout }) {
    this.tenant = tenant
    this.stream = stream
    this.thread = thread
    this.handlers = handlers
    this.timeout = timeout
    Object.freeze(this)
  }
}
