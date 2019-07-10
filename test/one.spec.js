'use strict'

const { init, teardown } = require('./setup')
const { Actor } = require('../index')
const { Calculator2, EventCounter } = require('./model')
const SimpleCache = require('../src/SimpleCache')

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
let cache, ch, sr, ch2, handlers

after (async () => {
  await teardown()
})

before (async () => {
  const factory = await init()
  ch2 = factory.createCommandHandler([Calculator2])
})

describe('One', () => {

})