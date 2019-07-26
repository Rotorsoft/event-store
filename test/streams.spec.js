'use strict'

const { init, teardown } = require('./setup')
const { Actor, ITracer } = require('../index')
const { Calculator, EventCounter } = require('./model')
const SimpleCache = require('../src/SimpleCache')
const ConsoleTracer = require('./ConsoleTracer')

const aggId = 'xyz-'.concat(Date.now())

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
const tracer = new ConsoleTracer()
let cache, factory, ch, sr

after (async () => {
  await teardown()
})

describe('Streams', () => {
  before (async () => {
    factory = await init()
    ch = factory.createCommandHandler([Calculator])
    sr = factory.createStreamReader()
    cache = new SimpleCache()
  })

  it('should catch up counter2 in current window', async () => {
    const handlers1 = [new EventCounter(cache, 'counter11')]
    const handlers2 = [new EventCounter(cache, 'counter11'), new EventCounter(cache, 'counter21')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'thread-x', handlers1, { limit: 500 })
    let counter1 = cache.get('/counters/counter11')
    counter1.events[aggId].should.equal(3)
    
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'thread-y', handlers2, { limit: 500 })

    counter1 = cache.get('/counters/counter11')
    counter1.events[aggId].should.equal(9) // counted 3 times by thread-x and 6 times by thread-y
    let counter2 = cache.get('/counters/counter21')
    counter2.events[aggId].should.equal(6)
  })

  it('should catch up counting with catchup window', async () => {
    const handlers1 = [new EventCounter(cache, 'counter11')]
    const handlers2 = [new EventCounter(cache, 'counter11'), new EventCounter(cache, 'counter21'), new EventCounter(cache, 'counter31')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'thread-x', handlers1, { limit: 500 })
    
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    
    await sr.poll('tenant1', 'thread-y', handlers2, { limit: 500 })

    let counter1 = cache.get('/counters/counter11')
    let counter2 = cache.get('/counters/counter21')
    let counter3 = cache.get('/counters/counter31')
    // console.log(counter1)
    // console.log(counter2)
    // console.log(counter3)
    counter1.events[aggId].should.equal(21) // counted 9 times by thread-x, plus 12 times by thread-y
    counter2.events[aggId].should.equal(12)
    counter3.events[aggId].should.equal(12)
  })

  it('should catch up counting with catchup window 2', async () => {
    const handlers1 = [new EventCounter(cache, 'counter41')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })

    await sr.poll('tenant1', 'thread-1', handlers1, { limit: 500 })
    
    let counter4 = cache.get('/counters/counter41')
    //console.log(counter4)
    counter4.events[aggId].should.equal(14)
  })

  it('should catch up counting in parallel', async () => {
    const handlers1 = [new EventCounter(cache, 'counter51')]
    const handlers2 = [new EventCounter(cache, 'counter61')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    let ch2 = factory.createCommandHandler([Calculator])
    await ch2.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })

    await sr.poll('tenant1', 'thread-1', handlers1, { limit: 500 })
    await sr.poll('tenant1', 'thread-2', handlers2, { limit: 500 })

    let counter5 = cache.get('/counters/counter51')
    let counter6 = cache.get('/counters/counter61')
    //console.log(counter5)
    //console.log(counter6)
    counter5.events[aggId].should.equal(17)
    counter6.events[aggId].should.equal(17)
  })

  it('should poll until done', async () => {
    const handlers1 = [new EventCounter(cache, 'counter71')]

    await sr.poll('tenant1', 'thread-1', handlers1, { limit: 20 })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await sr.poll('tenant1', 'thread-1', handlers1, { limit: 500 })

    let counter7 = cache.get('/counters/counter71')
    //console.log(counter7)
    counter7.events[aggId].should.equal(18)
  })

  it('should finish all threads', async () => {
    const handlers = [
      new EventCounter(cache, 'counter11'),
      new EventCounter(cache, 'counter21'),
      new EventCounter(cache, 'counter31'),
      new EventCounter(cache, 'counter41'),
      new EventCounter(cache, 'counter51'),
      new EventCounter(cache, 'counter61'),
      new EventCounter(cache, 'counter71'),
    ]

    await sr.poll('tenant1', 'thread-1', handlers, { limit: 600 })
    await sr.poll('tenant1', 'thread-2', handlers, { limit: 600 })
    await sr.poll('tenant1', 'thread-x', handlers, { limit: 600 })
    await sr.poll('tenant1', 'thread-y', handlers, { limit: 600 })

    let counter1 = cache.get('/counters/counter11')
    let counter2 = cache.get('/counters/counter21')
    let counter3 = cache.get('/counters/counter31')
    let counter4 = cache.get('/counters/counter41')
    let counter5 = cache.get('/counters/counter51')
    let counter6 = cache.get('/counters/counter61')
    let counter7 = cache.get('/counters/counter71')

    // all counted 72 times (18 times by each thread)
    counter1.events[aggId].should.equal(72)
    counter2.events[aggId].should.equal(72)
    counter3.events[aggId].should.equal(72)
    counter4.events[aggId].should.equal(72)
    counter5.events[aggId].should.equal(72)
    counter6.events[aggId].should.equal(72)
    counter7.events[aggId].should.equal(72)
  })
})
