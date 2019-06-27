'use strict'

const IEventStore = require('../IEventStore')
const Aggregate = require('../Aggregate')
const Event = require('../Event')
const Err = require('../Err')
const Lease = require('../Lease')

module.exports = class DynamoDbEventStore extends IEventStore {
  constructor (dynamo) {
    super()
    this.dynamo = dynamo
    Object.freeze(this)
  }
}