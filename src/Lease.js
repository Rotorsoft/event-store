'use strict'

module.exports = class Lease {
  /**
   * Lease constructor
   * 
   * @param {Integer} token The token identifying this lease
   * @param {Integer} version The version of the stream when this lease was loaded
   * @param {Object} cursors The map of handled offsets in the stream
   * @param {Integer} offset The offset of the loaded events
   * @param {Array} events The array of loaded events
   * @param {Integer} expiresAt The expiration time of this lease
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