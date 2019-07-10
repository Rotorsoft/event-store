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
   * @param {String} id The padded stream id (aggregate version)
   * @param {String} aid The aggregate id (partition key)
   * @param {CommandContext} context The command context where this event was created
   */
  stamp (id, aid, context) {
    const object = Object.assign({}, this, {
      id,
      aid,
      gid: Date.now().toString().concat('.', id), // global position id used to replay all events in order
      type: context.aggregateType.name,
      actor: context.actor.id,
      command: context.command
    })
    return Object.freeze(object)
  }
}