'use strict'

const CommandHandler = require('./CommandHandler')
const StreamReader = require('./StreamReader')
const Err = require('./Err')
const FirestoreEventStore = require('./firestore/FirestoreEventStore')
const CosmosDbEventStore = require('./cosmosdb/CosmosDbEventStore')

module.exports = class Factory {
  /**
   * Factory constructor
   * 
   * @param {Object} db The cloud data store
   */
  constructor (db) {
    Err.required('db', db, 'object')
    if (db.collection) {
      this.store = new FirestoreEventStore(db)
    } else if (db.database) {
      this.store = new CosmosDbEventStore(db)
    } else {
      throw Err.invalidArgument('db')
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