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
   * Stream name where events are published
   */
  get stream() { return 'main' }

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
   * @param {Event} event The event
   */
  async handle (tenant, event) {
    const eh = this.events[event.name]
    if (eh) await eh(tenant, event)
  }
}
