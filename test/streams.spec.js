'use strict'

const { init, teardown } = require('./setup')
const { Actor, ITracer } = require('../index')
const { Calculator, EventCounter } = require('./model')

class ConsoleTracer extends ITracer {
  constructor () {
    super()
  }

  trace (fn) {
    const { method, context, tenant, stream, events, handler, error, event, lease, offset, ...args } = fn()
    if (error) {
      console.log(`!!! ERROR: ${error}`)
    }
    // if (context) console.log(`  ${method}: ${context.command} - ${JSON.stringify(context.payload)}`)
    if (lease) console.log(lease)
    if (handler) console.log(`  ${handler}: handled ${event.name}.v${event.version} on ${event.agg_id}.v${event.agg_version} at ${offset}`)
    // if (handler) console.log(`  ${handler}: handled ${event.name}.v${event.version}, actor ${event.actor}, aggregate ${event.agg_id}.v${event.agg_version}, on tenant ${tenant} - stream ${stream}`)
  }
}

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
const tracer = new ConsoleTracer()
let firestore, factory, ch, sr, aggId

after (async () => {
  await teardown()
})

describe('Streams', () => {
  before (async () => {
    factory = await init()
    ch = factory.createCommandHandler([Calculator], tracer)
    sr = factory.createStreamReader(tracer)
    aggId = 'xyz-'.concat(Date.now())
    firestore = ch._store_.firestore
  })

  it('should catch up counter2 in current window', async () => {
    const handlers1 = [new EventCounter(firestore, 'counter11')]
    const handlers2 = [new EventCounter(firestore, 'counter11'), new EventCounter(firestore, 'counter21')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers1, { limit: 500 })
    let counter1 = await firestore.doc('/counters/counter11').get()
    counter1.data().events[aggId].should.equal(3)
    
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers2, { limit: 500 })
    counter1 = await firestore.doc('/counters/counter11').get()
    counter1.data().events[aggId].should.equal(6)
    let counter2 = await firestore.doc('/counters/counter21').get()
    counter2.data().events[aggId].should.equal(6)
  })

  it('should catch up counting with catchup window', async () => {
    const handlers1 = [new EventCounter(firestore, 'counter11')]
    const handlers2 = [new EventCounter(firestore, 'counter11'), new EventCounter(firestore, 'counter21'), new EventCounter(firestore, 'counter31')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers1, { limit: 500 })
    
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 3, number2: 4, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 1, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers2, { limit: 5 })
    await sr.poll('tenant1', 'main', handlers2, { limit: 500 })

    let counter1 = await firestore.doc('/counters/counter11').get()
    let counter2 = await firestore.doc('/counters/counter21').get()
    let counter3 = await firestore.doc('/counters/counter31').get()
    console.log(counter1.data())
    console.log(counter2.data())
    console.log(counter3.data())
    counter1.data().events[aggId].should.equal(12)
    counter2.data().events[aggId].should.equal(12)
    counter3.data().events[aggId].should.equal(12)
  })

  it('should catch up counting with catchup window 2', async () => {
    const handlers1 = [new EventCounter(firestore, 'counter41')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers1, { limit: 5 })
    await sr.poll('tenant1', 'main', handlers1, { limit: 500 })
    let counter4 = await firestore.doc('/counters/counter41').get()
    console.log(counter4.data())
    counter4.data().events[aggId].should.equal(14)
  })

  it('should catch up counting in parallel', async () => {
    const handlers1 = [new EventCounter(firestore, 'counter51')]
    const handlers2 = [new EventCounter(firestore, 'counter61')]

    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    let ch2 = factory.createCommandHandler([Calculator])
    await ch2.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers1, { limit: 7 })
    let main = await firestore.doc('/tenants/tenant1/streams/main').get()
    console.log(main.data())
    await sr.poll('tenant1', 'main', handlers1, { limit: 500 })
    main = await firestore.doc('/tenants/tenant1/streams/main').get()
    console.log(main.data())

    await sr.poll('tenant1', 'main', handlers2, { limit: 500 })
 
    main = await firestore.doc('/tenants/tenant1/streams/main').get()
    console.log(main.data())

    let counter5 = await firestore.doc('/counters/counter51').get()
    let counter6 = await firestore.doc('/counters/counter61').get()
    console.log(counter5.data())
    console.log(counter6.data())
    counter5.data().events[aggId].should.equal(17)
    counter6.data().events[aggId].should.equal(17)
  })

  it('should poll until done', async () => {
    const handlers1 = [new EventCounter(firestore, 'counter71')]

    await sr.poll('tenant1', 'main', handlers1, { limit: 20 })
    await ch.command(actor1, 'AddNumbers', { number1: 1, number2: 2, aggregateId: aggId })
    await sr.poll('tenant1', 'main', handlers1, { limit: 500 })
    let counter7 = await firestore.doc('/counters/counter71').get()
    console.log(counter7.data())
    counter7.data().events[aggId].should.equal(18)
  })
})
