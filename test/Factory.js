'use strict'

const CommandHandler = require('../src/CommandHandler')
const StreamReader = require('../src/StreamReader')
const Err = require('../src/Err')
const FirestoreEventStore = require('../src/stores/FirestoreEventStore')
const CosmosDbEventStore = require('../src/stores/CosmosDbEventStore')
const MongoDbEventStore = require('../src/stores/MongoDbEventStore')
const DynamoDbEventStore = require('../src/stores/DynamoDbEventStore')

module.exports = class Factory {
  /**
   * Factory constructor
   * 
   * @param {Object} store The cloud data store
   */
  constructor (store) {
    Err.required('store', store, 'object')
    if (store.topology) {
      this.store = new MongoDbEventStore(store)
    } else if (store.collection) {
      this.store = new FirestoreEventStore(store)
    } else if (store.database) {
      this.store = new CosmosDbEventStore(store)
    } else if (store.put) {
      this.store = new DynamoDbEventStore(store)
    } else {
      throw Err.invalidArgument('store')
    }
    Object.freeze(this)
  }

  /**
   * Creates new command handler linked to the store
   * 
   * @param {Array} aggregates The aggregate types supported by this handler
   * @param {ITracer} tracer The optional tracer
   * @param {Number} cache_size The optional cache size to cache aggregate snapshots
   */
  createCommandHandler (aggregates, tracer = null, cache_size = 10) {
    return new CommandHandler(this.store, aggregates, tracer, cache_size)
  }

  /**
   * Creates new stream reader linked to the store
   * 
   * @param {ITracer} tracer The optional tracer
   */
  createStreamReader (tracer = null) {
    return new StreamReader(this.store, tracer)
  }
}