'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Event = require('../Event')
const Err = require('../Err')
const Lease = require('../Lease')

module.exports = class CosmosDbEventStore extends IEventStore {
  constructor (cosmos) {
    super()
    this.cosmos = cosmos
    Object.freeze(this)
  }
}