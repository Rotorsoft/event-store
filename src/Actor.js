'use strict'

const Err = require('./Err')

module.exports = class Actor {
  constructor ({ tenant, id, name, email, roles = [] }) {
    Err.required('tenant', tenant)
    Err.required('id', id)
    Err.required('name', name)
    this.tenant = tenant
    this.id = id
    this.name = name
    this.email = email
    this.roles = roles
    Object.freeze(this)
  }
}
