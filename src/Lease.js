'use strict'

module.exports = class Lease {
  /**
   * Lease constructor
   * 
   * @param {Number} token The token identifying this lease
   * @param {Object} cursors The map of handled offsets in the stream
   * @param {Array} events The array of loaded events
   * @param {Number} offset The offset of the loaded events
   */
  constructor ({ token, cursors, events, offset }) {
    this.token = token
    this.cursors = cursors
    this.events = events
    this.offset = offset
    Object.freeze(this)
  }
}