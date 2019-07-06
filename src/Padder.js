'use strict'

const Err = require('./Err')

class Padder {
  constructor (max = 1e9) {
    if (max > 1e9) throw Err.invalidArgument('max')
    this.padLen = (max - 1).toString().length
    this.padStr = '000000000'.substr(0, this.padLen)
    Object.freeze(this)
  }

  pad (number) {
    const s = number.toString()
    return this.padStr.substr(0, this.padLen - s.length).concat(s)
  }
}

module.exports = new Padder()