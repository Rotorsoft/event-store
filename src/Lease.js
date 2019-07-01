'use strict'

module.exports = class Lease {
  /**
   * Lease constructor
   * 
   * @param {Number} token The token identifying this lease
   * @param {Number} version The version of the stream when this lease was loaded
   * @param {Object} cursors The map of handled offsets in the stream
   * @param {Number} offset The offset of the loaded events
   * @param {Array} events The array of loaded events
   * @param {Number} expiresAt The expiration time of this lease
   */
  constructor ({ token, version, cursors, offset, events, expiresAt }) {
    this.token = token
    this.version = version
    this.cursors = cursors
    this.offset = offset
    this.events = events
    this.expiresAt = expiresAt
    Object.freeze(this)
  }
}