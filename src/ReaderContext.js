'use strict'

module.exports = class ReaderContext {
  /**
   * Reader context constructor
   * 
   * @param {String} tenant The tenant id
   * @param {String} stream The stream name
   * @param {Array} handlers Array of event handlers
   * @param {Integer} timeout The timeout in millis to expire lease
   */
  constructor ({ tenant, stream, handlers, timeout }) {
    this.tenant = tenant
    this.stream = stream
    this.handlers = handlers
    this.timeout = timeout
    Object.freeze(this)
  }
}
