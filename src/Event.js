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
   * @param {String} aggregateId The aggregate id pushing this event
   * @param {Integer} aggregateVersion The aggregate version after this event ocurred
   */
  toObject (context, aggregateId, aggregateVersion) {
    const object = Object.assign({}, this, {
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