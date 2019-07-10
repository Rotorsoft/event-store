'use strict'

const Err = require('./Err')

class Padder {
  constructor (max = 1e9) {
    if (max > 1e9) throw Err.invalidArgument('max')
    this._len = (max - 1).toString().length
    this._pad = '000000000'.substr(0, this._len)
    Object.freeze(this)
  }

  pad (number) {
    const s = number.toString()
    return this._pad.substr(0, this._len - s.length).concat(s)
  }

  unpad (str) { return Number.parseInt(str.slice(-this._len)) }
}

module.exports = new Padder()
