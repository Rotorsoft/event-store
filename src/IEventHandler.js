'use strict'

/**
 * EventHandler interface to be implemented by manager processes polling from event streams
 */
module.exports = class IEventHandler {
  /**
   * Unique name in stream (used to store cursors)
   */
  get name () { return '' }

  /**
   * Object map of async event handlers
   * 
   * Example:
   *    get events () {
   *      return {
   *        ['Event1']: async (tenant, event) => {
   *          ...
   *        },
   *        ['Event2']: async (tenant, event) => {
   *          ...
   *        }
   *      }
   *    }
   */
  get events () { return {} }

  /**
   * Handles event
   * 
   * @param {String} tenant The tenant id
   * @param {Object} envelope The envelope with metadata and events
   */
  async handle (tenant, envelope) {
    envelope.events.forEach(async event => {
      const eh = this.events[event.name]
      if (eh) await eh(tenant, event, envelope)
    })
  }
}
