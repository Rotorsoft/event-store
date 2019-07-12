'use strict'

const PADS = ['00000', '0000', '000', '00', '0', '']

const pad = int => {
  const s = int.toString()
  return PADS[s.length - 1].concat(s)
}

const unpad = str => Number.parseInt(str.slice(-6))

module.exports = { pad, unpad }
