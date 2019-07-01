'use strict'

const CommandHandler = require('./CommandHandler')
const StreamReader = require('./StreamReader')
const Err = require('./Err')
const FirestoreEventStore = require('./firestore/FirestoreEventStore')

module.exports = class Factory {
  /**
   * Factory constructor
   * 
   * @param {Object} provider The cloud data store provider
   * @param {Object} db The cloud data store
   */
  constructor (provider, db) {
    Err.required('provider', provider, 'object')
    Err.required('db', db, 'object')
    if (provider.firestore) {
      this.store = new FirestoreEventStore(db)
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