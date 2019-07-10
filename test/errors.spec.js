'use strict'

const { init, teardown } = require('./setup')
const { Actor, Aggregate, CommandHandler } = require('../index')
const FirestoreEventStore = require('../src/firestore/FirestoreEventStore')
const { Calculator } = require('./model')
const { InvalidAggregate } = require('./invalid')

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
let factory, ch

after (async () => {
  await teardown()
})

describe('Err handling', () => {
  before (async () => {
    factory = await init()
    ch = factory.createCommandHandler([Calculator])
  })

  it('should throw missing arguments actor', async () => {
    try {
      await ch.command(null, 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('actor')
    }
  })

  it('should throw missing arguments actor.id', async () => {
    try {
      await ch.command(new Actor({ name: 'user1', tenant: 'tenant1', roles: [] }), 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('id')
    }
  })

  it('should throw missing arguments actor.name', async () => {
    try {
      await ch.command(new Actor({ id: 'user1', tenant: 'tenant1', roles: [] }), 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('name')
    }
  })

  it('should throw missing arguments actor.tenant', async () => {
    try {
      await ch.command(new Actor({ id: 'user1', name: 'user1', roles: [] }), 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('tenant')
    }
  })

  it('should throw missing arguments actor.roles', async () => {
    try {
      await ch.command(new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1' }), 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('roles')
    }
  })

  it('should throw missing arguments command', async () => {
    try {
      await ch.command(actor1, '', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('command')
    }
  })

  it('should throw invalid arguments command', async () => {
    try {
      await ch.command(actor1, 'abc', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('InvalidArgumentError')
      error.argument.should.be.equal('command')
    }
  })

  it('should throw missing arguments aggregateId', async () => {
    try {
      await ch.command(actor1, 'abc', { number1: 1, number2: 2, expectedVersion: 1 })
    }
    catch(error) {
      error.name.should.be.equal('MissingArgumentError')
      error.argument.should.be.equal('aggregateId')
    }
  })

  it('should throw invalid arguments number1', async () => {
    try {
      await ch.command(actor1, 'AddNumbers')
    }
    catch(error) {
      error.name.should.be.equal('InvalidArgumentError')
      error.argument.should.be.equal('number1')
    }
  })
})

describe('Not implemented', () => {
  before (async () => {
    factory = await init()
    ch = factory.createCommandHandler([Calculator])
  })

  it('should throw not implemented loadAggregate', async () => {
    const m = FirestoreEventStore.prototype.loadAggregate
    try {
      delete FirestoreEventStore.prototype.loadAggregate
      await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('NotImplementedError')
      error.method.should.be.equal('loadAggregate')
      FirestoreEventStore.prototype.loadAggregate = m
    }
  })

  it('should throw not implemented commitEvents', async () => {
    const m = FirestoreEventStore.prototype.commitEvents
    try {
      delete FirestoreEventStore.prototype.commitEvents
      await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc22' })
    }
    catch(error) {
      error.name.should.be.equal('NotImplementedError')
      error.method.should.be.equal('commitEvents')
      FirestoreEventStore.prototype.commitEvents = m
    }
  })
})

describe('Err handling 2', () => { 
  before (async () => {
    factory = await init()
  })

  it('should throw invalid arguments: store', async () => {
    try {
      let ch2 = new CommandHandler(new Object(), [])
    }
    catch(error) {
      error.name.should.equal('InvalidArgumentError')
      error.argument.should.equal('store')
    }
  })

  it('should throw not implemented commands', async () => {
    try {
      const ch = factory.createCommandHandler([InvalidAggregate])
      await ch.command(actor1, 'InvalidCommand', { number1: 1, number2: 2 })
    }
    catch(error) { 
      error.name.should.be.equal('NotImplementedError')
      error.method.should.be.equal('commands')
    }
  })

  it('should throw not implemented events', async () => {
    try {
      const ch = factory.createCommandHandler([InvalidAggregate])
      InvalidAggregate.prototype.handleCommand = Calculator.prototype.handleCommand
      await ch.command(actor1, 'InvalidCommand', { number1: 1, number2: 2 })
    }
    catch(error) { 
      error.name.should.be.equal('NotImplementedError')
      error.method.should.be.equal('events')
    }
  })

  it('should throw invalid arguments aggregateType', async () => {
    try {
      const ch = factory.createCommandHandler([InvalidCommand])
    }
    catch(error) {
      error.message.should.be.equal('InvalidCommand is not defined')
    }
  })

  it('should throw precondition error', async () => {
    try {
      const ch = factory.createCommandHandler([InvalidAggregate])
      await ch.command(actor1, 'InvalidCommand3', { a: 1, b: 3 })
    }
    catch(error) {
      error.name.should.equal('PreconditionError')
      error.message.should.equal('a must be greater than b')
    }
  })

  it('should throw not implemented events', async () => {
    try {
      class A extends Aggregate {
        constructor() { super() }
        get commands () { return { C: async () => { this.push('a', 'E', {}) } } }
      }
      const ch = factory.createCommandHandler([A])
      await ch.command(actor1, 'C')
    }
    catch(error) {
      error.name.should.be.equal('NotImplementedError')
      error.method.should.be.equal('events')
    }
  })

  it('should throw not implemented commands', async () => {
    try {
      class A extends Aggregate {
        constructor() { super() }
        get events () { return { E: () => {} } }
      }
      const ch = factory.createCommandHandler([A])
      await ch.command(actor1, 'C')
    }
    catch(error) {
      error.name.should.be.equal('NotImplementedError')
      error.method.should.be.equal('commands')
    }
  })
})
