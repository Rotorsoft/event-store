'use strict'

const { startProject, endProject } = require('./setup')
const { Factory, Actor } = require('../index')
const { Calculator, Calculator2, EventCounter } = require('./model')

process.on('unhandledRejection', error => { console.log('unhandledRejection', error) })

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
let f1, f2, ch, sr, ch2, sr2, handlers

describe('Basic', () => {
  before (async () => {
    console.log('starting project basic1')
    f1 = await startProject('basic1')
    const factory = new Factory(f1)
    ch = factory.createCommandHandler([Calculator])
    sr = factory.createStreamReader()
    handlers = [new EventCounter(f1, 'counter1'), new EventCounter(f1, 'counter2')]
  })

  after (async () => {
    console.log('ending project basic1')
    await endProject('basic1')
  })

  it('should accumulate numbers to 12 on calc123', async () => {
    let ctx
    let aggId = 'calc123-'.concat(Date.now())
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: ctx.aggregateId })
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: ctx.aggregateId })
    let more = true
    do {
      more = await sr.poll('tenant1', 'main', handlers)
    } while (more)
    const counter = await f1.doc('/counters/counter1').get()
    ctx.aggregate.aggregateVersion.should.equal(2)
    ctx.aggregate.sum.should.equal(12)
    const data = counter.data()
    console.log(aggId)
    console.log(data)
    data.events[aggId].should.equal(3)
  })

  it('should accumulate numbers to 10', async () => {
    let ctx 
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2 })
    ctx = await ch.command(actor1, 'AddNumbers', { aggregateId: ctx.aggregate.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion, number1: 3, number2: 4 })
    await sr.poll('tenant1', 'main', handlers)
    ctx.aggregate.aggregateVersion.should.equal(1)
    ctx.aggregate.sum.should.equal(10)
  })

  it('should throw concurrency error', async () => {
    try {
      let ctx
      const aggId = 'calc1-'.concat(Date.now())
      ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
      ctx = await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: ctx.aggregate.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion })
      ctx = await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: ctx.aggregate.aggregateId, expectedVersion: 0 })
      await sr.poll('tenant1', 'main', handlers)
    }
    catch(error) {
      error.name.should.be.equal('ConcurrencyError')
    }
  })

  it('should accumulate numbers to 12 on calc9', async () => {
    const iters = 12
    const aggId = 'calc9-'.concat(Date.now())
    let ctx = await ch.command(actor1, 'AddNumbers', { number1: 0, number2: 1, aggregateId: aggId })
    for (let i = 0; i < iters; i++) {
      ctx = await ch.command(actor1, 'AddNumbers', { number1: 0, number2: 1, aggregateId: ctx.aggregate.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion })
    }
    await sr.poll('tenant1', 'main', handlers)
    ctx.aggregate.aggregateVersion.should.equal(iters)
    ctx.aggregate.sum.should.equal(iters + 1)
  })
})

describe('Basic without snapshots', () => {
  before (async () => {
    console.log('starting project basic2')
    f2 = await startProject('basic2')
    const factory = new Factory(f2)
    ch2 = factory.createCommandHandler([Calculator2])
    sr2 = factory.createStreamReader()
    handlers = [new EventCounter(f2, 'counter3')]
  })

  after (async () => {
    console.log('ending project basic2')
    await endProject('basic2')
  })

  it('should load aggregate from events', async () => {
    let ctx
    const aggId = 'calc100-'.concat(Date.now())
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: ctx.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion })
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: ctx.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion })
    await sr2.poll('tenant1', 'main', handlers)
    ctx.aggregate.aggregateVersion.should.equal(2)
    ctx.aggregate.sum.should.equal(12)
  })

  it('should accumulate numbers to 3 with system generated id', async () => {
    let ctx
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 2, number2: 2 })
    ctx = await ch2.command(actor1, 'SubtractNumbers', { aggregateId: ctx.aggregate.aggregateId, number1: 1, number2: 0 })
    await sr2.poll('tenant1', 'main', handlers)
    ctx.aggregate.aggregateVersion.should.equal(1)
    ctx.aggregate.aggregateId.length.should.be.at.least(10)
    ctx.aggregate.sum.should.equal(3)
  })
})
