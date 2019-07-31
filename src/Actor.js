'use strict'

const Err = require('./Err')

module.exports = class Actor {
  /**
   * Constructs new Actor
   * 
   * @param {String} tenant The tenant id
   * @param {String} id The actor id
   * @param {Array} roles The actor roles as array of strings
   * @param {Object} props Other properties
   */
  constructor ({ tenant, id, roles = [], ...props }) {
    Err.required('tenant', tenant)
    Err.required('id', id)
    Err.required('roles', roles, 'array')
    this.tenant = tenant
    this.id = id
    this.roles = roles
    Object.assign(this, props)
    Object.freeze(this)
  }
}
