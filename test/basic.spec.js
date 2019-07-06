'use strict'

const { init, teardown } = require('./setup')
const { Actor } = require('../index')
const { Calculator, Calculator2, EventCounter } = require('./model')
const SimpleCache = require('../src/SimpleCache')

process.on('unhandledRejection', error => { console.log('unhandledRejection', error) })

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
let cache, ch, sr, ch2, handlers

after (async () => {
  await teardown()
})

describe('Basic', () => {
  before (async () => {
    const factory = await init()
    ch = factory.createCommandHandler([Calculator])
    sr = factory.createStreamReader()
    cache = new SimpleCache(200)
    handlers = [new EventCounter(cache, 'counter1'), new EventCounter(cache, 'counter2')]
  })

  it('should accumulate numbers to 12 on calc123', async () => {
    let ctx
    let aggId = 'calc123-'.concat(Date.now())
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: ctx.aggregateId })
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: ctx.aggregateId })
    let more = true
    do {
      more = await sr.poll('tenant1', 'main', 'thread1', handlers)
    } while (more)
    const counter = cache.get('/counters/counter1')
    ctx.aggregate.aggregateVersion.should.equal(2)
    ctx.aggregate.sum.should.equal(12)
    //console.log(aggId)
    //console.log(counter)
    counter.events[aggId].should.equal(3)
  })

  it('should accumulate numbers to 10', async () => {
    let ctx 
    ctx = await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2 })
    ctx = await ch.command(actor1, 'AddNumbers', { aggregateId: ctx.aggregate.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion, number1: 3, number2: 4 })
    await sr.poll('tenant1', 'main', 'thread1', handlers)
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
      await sr.poll('tenant1', 'main', 'thread1', handlers)
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
    await sr.poll('tenant1', 'main', 'thread1', handlers)
    ctx.aggregate.aggregateVersion.should.equal(iters)
    ctx.aggregate.sum.should.equal(iters + 1)
  })
})

describe('Basic without snapshots', () => {
  before (async () => {
    const factory = await init()
    ch2 = factory.createCommandHandler([Calculator2])
  })

  it('should load aggregate from events', async () => {
    let ctx
    const aggId = 'calc100-'.concat(Date.now())
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: ctx.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion })
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: ctx.aggregateId, expectedVersion: ctx.aggregate.aggregateVersion })
    ctx.aggregate.aggregateVersion.should.equal(2)
    ctx.aggregate.sum.should.equal(12)
  })

  it('should accumulate numbers to 3 with system generated id', async () => {
    let ctx
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 2, number2: 2 })
    ctx = await ch2.command(actor1, 'SubtractNumbers', { aggregateId: ctx.aggregate.aggregateId, number1: 1, number2: 0 })
    ctx.aggregate.aggregateVersion.should.equal(1)
    ctx.aggregate.aggregateId.length.should.be.at.least(10)
    ctx.aggregate.sum.should.equal(3)
  })

  it('should load aggregate from context', async () => {
    let ctx
    ctx = await ch2.command(actor1, 'AddNumbers', { number1: 2, number2: 2 })
    ctx = await ch2.command(actor1, 'SubtractNumbers', { aggregateId: ctx.aggregate.aggregateId, number1: 1, number2: 0 })
    const agg = await ctx.load(Calculator, ctx.aggregate.aggregateId)
    agg.aggregateVersion.should.equal(1)
    agg.aggregateId.should.equal(ctx.aggregate.aggregateId)
    agg.sum.should.equal(3)
  })
})
