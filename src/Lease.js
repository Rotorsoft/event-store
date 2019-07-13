'use strict'

module.exports = class Lease {
  /**
   * Lease constructor
   * 
   * @param {Number} token The token identifying this lease
   * @param {Object} cursors The map of handled offsets in the stream
   * @param {Array} envelopes The array of loaded envelopes
   * @param {Number} offset The offset of the loaded envelopes
   */
  constructor ({ token, cursors, envelopes, offset }) {
    this.token = token
    this.cursors = cursors
    this.envelopes = envelopes
    this.offset = offset
    Object.freeze(this)
  }
}