'use strict'

/**
 * Event class
 */
module.exports = class Event {
  /**
   * Event constructor
   * 
   * @param {Object} object Event properties like name, version, payload
   */
  constructor (object) {
    Object.assign(this, object)
    Object.freeze(this)
  }

  /**
   * Converts event to object with metadata for storage
   * 
   * @param {CommandContext} context The command context where this event was created
   * @param {Number} id The event id or event offset in the stream
   * @param {String} aggregateId The aggregate id pushing this event
   * @param {Number} aggregateVersion The aggregate version after this event ocurred
   */
  toObject (context, id, aggregateId, aggregateVersion) {
    const object = Object.assign({}, this, {
      id,
      agg_type: context.aggregateType.name,
      agg_id: aggregateId,
      agg_version: aggregateVersion,
      actor: context.actor.id,
      command: context.command,
      time: new Date().toISOString()
    })
    return Object.freeze(object)
  }
}