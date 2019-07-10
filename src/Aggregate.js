'use strict'

const Event = require('./Event')
const Padder = require('./Padder')
const Err = require('./Err')

/**
 * Aggregate base class
 */
module.exports = class Aggregate {
  /**
   * Aggregate factory method
   * @param {Object} aggregateType subclass of Aggregate
   * @param {Object} object with optional payload attributes including _aggregate_id_ and _aggregate_version_
   * @returns {Aggregate} instance of aggregateType
   */
  static create (aggregateType, { _aggregate_id_ = '', _aggregate_version_ = -1, ...payload } = {}) {
    const aggregate = new aggregateType.prototype.constructor()
    Object.assign(aggregate, payload)
    Object.defineProperty(aggregate, '_aggregate_id_', { value: _aggregate_id_, writable: !_aggregate_id_, enumerable: true }) 
    Object.defineProperty(aggregate, '_aggregate_version_', { value: _aggregate_version_, writable: true, enumerable: true })
    Object.defineProperty(aggregate, '_uncommitted_events_', { value: [], writable: false, enumerable: false })
    return aggregate
  }

  get aggregateId () { return this._aggregate_id_ }
  get aggregateVersion () { return this._aggregate_version_ }

  /** 
   * Flag to save snapshots
   */
  static get snapshot () { return true }

  /**
   * Object map of async command handlers receiving command context
   * 
   * Example:
   *    get commands () {
   *      return {
   *        Command1: async (context) => {
   *          ...
   *        },
   *        Command2: async (context) => {
   *          ...
   *        }
   *      }
   *    }
   */
  get commands () { throw Err.notImplemented('commands') }

  /**
   * Object map of event handlers receiving event argument
   *
   * Example:
   *    get events () {
   *      return {
   *        ['Event1']: (event) => {
   *          ...
   *        },
   *        ['Event2']: (event) => {
   *          ...
   *        }
   *      }
   *    }
   */
  get events () { throw Err.notImplemented('events') }

  /**
   * Event factory method used by command handlers to push new events
   * @param {String} name event name
   * @param {Object} payload event payload
   * @param {Number} version optional event version
   */
  push (name, payload, version = 0) {
    const event = new Event({ name, version, payload })
    this.events[name](event)
    this._uncommitted_events_.push(event)
  }

  /**
   * Replays event and adjusts version. Called internally by event stores when loading aggregates
   * 
   * @param {Event} event The event 
   */
  _replay (event) {
    this.events[event.name](event)
    this._aggregate_version_ = Padder.unpad(event.id)
  }

  /**
   * Clones aggregate for storage/caching purposes. Override if deep cloning is needed
   * 
   * @returns {Object} Object with aggregate data
   */
  clone () {
    return Object.assign({}, this)
  }
}
