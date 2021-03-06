'use strict'

const Err = require('./Err')

module.exports = class IEventStore {
  /**
   * Loads aggregate from store (can use snapshots and/or events)
   * 
   * @param {CommandContext} context The command context
   * @param {String} aggregateId The aggregate id
   * @param {Number} expectedVersion The aggregate expected version
   * @returns {Aggregate} Loaded aggregate
   */
  async loadAggregate (context, aggregateId, expectedVersion = -1) { throw Err.notImplemented('loadAggregate') }

  /**
   * Commits aggregate's pending events to store
   * 
   * @param {CommandContext} context The command context with loaded aggregate
   * @param {Number} expectedVersion The aggregate expected version
   */
  async commitEvents (context, expectedVersion = -1) { throw Err.notImplemented('commitEvents') }

  /**
   * Polls stream for new events covering handlers
   * 
   * @param {ReaderContext} context The reader context
   * @param {Number} limit Max number of events to poll
   * @returns {Lease} New lease to read stream
   */
  async pollStream (context, limit) { throw Err.notImplemented('pollStream') }

  /**
   * Commits stream cursors after successfull handling of events
   * 
   * @param {ReaderContext} context The reader context
   * @param {Lease} lease The lease with updated cursors after handling events
   * @returns {Boolean} True if any of the handlers is still behind
   */
  async commitCursors (context, lease) { throw Err.notImplemented('commitCursors') }
}
