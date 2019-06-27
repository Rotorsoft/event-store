'use strict'

const { startProject, endProject } = require('./setup')
const { Factory, Actor, ITracer } = require('../index')
const Calculator = require('./calculator')

class ConsoleTracer extends ITracer {
  constructor () {
    super()
    this.stats = {}
  }

  trace (fn) {
    const { method, context, events, ...args } = fn()
    if (method && events) {
      for (let event of events) {
        const key = event.command + '-' + event.name
        const s = this.stats[method] || {}
        const t = s[event.agg_type] || {}
        const e = t[key] || {} 
        e.time = e.time || Date.now()
        e.count = (e.count || 0) + 1
        t[key] = e
        s[event.agg_type] = t
        this.stats[method] = s
      }
    }
  }
}

const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })
let ch, tracer = new ConsoleTracer()

describe('Calculator basic operations', () => {
  before (async () => {
    console.log('starting project basicop')
    const f1 = await startProject('basicop')
    const factory = new Factory(f1)
    ch = factory.createCommandHandler([Calculator], tracer)
  })

  after (async () => {
    console.log('ending project basicop')
    await endProject('basicop')
  })

  async function c (calc, command, payload) {
    return await ch.command(actor1, command, Object.assign(payload, { aggregateId: calc.aggregateId, expectedVersion: calc.aggregateVersion }))
  }

  it('should compute 1+2-3*5=0', async () => {
    let ctx
    const aggregateId = 'c1-'.concat(Date.now())
    ctx = await ch.command(actor1, 'PressDigit', { digit: '1', aggregateId })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '+' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2'})
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '-' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3'})
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '*' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '5' })
    ctx = await c(ctx.aggregate, 'PressEquals', {})
  
    ctx.aggregate.result.should.equal(0)
  })

  it('should compute 4*4+21-16*3=63', async () => {
    let ctx
    const aggregateId = 'c2-'.concat(Date.now())
    ctx = await ch.command(actor1, 'PressDigit', { digit: '4', aggregateId })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '*' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '4' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '+' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '1' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '-' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '1' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '6' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '*' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3' })
    ctx = await c(ctx.aggregate, 'PressEquals', {})
  
    ctx.aggregate.result.should.equal(63)
  })

  it('should compute 4*4+21-16*3===567', async () => {
    let ctx
    const aggregateId = 'c3-'.concat(Date.now())
    ctx = await ch.command(actor1, 'PressDigit', { digit: '4', aggregateId })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '*' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '4' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '+' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '1' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '-' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '1' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '6' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '*' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3' })
    ctx = await c(ctx.aggregate, 'PressEquals', {})
    ctx = await c(ctx.aggregate, 'PressEquals', {})
    ctx = await c(ctx.aggregate, 'PressEquals', {})
  
    ctx.aggregate.result.should.equal(567)
  })

  it('should compute 1.5+2.0-11.22+.33=-7.39', async () => {
    let ctx
    const aggregateId = 'c4-'.concat(Date.now())
    ctx = await ch.command(actor1, 'PressDigit', { digit: '1', aggregateId })
    ctx = await c(ctx.aggregate, 'PressDot', {})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '5'})    
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '+' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2'})
    ctx = await c(ctx.aggregate, 'PressDot', {})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '0'})    
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '-' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '1'})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '1'})
    ctx = await c(ctx.aggregate, 'PressDot', {})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2'})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2'})
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '+' })
    ctx = await c(ctx.aggregate, 'PressDot', {})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3' })
    ctx = await c(ctx.aggregate, 'PressEquals', {})
  
    ctx.aggregate.result.toFixed(2).should.equal('-7.39')
  })

  it('should compute 5.23/.33*2=31.6969696969697', async () => {
    let ctx
    const aggregateId = 'c5-'.concat(Date.now())
    ctx = await ch.command(actor1, 'PressDigit', { digit: '5', aggregateId })
    ctx = await c(ctx.aggregate, 'PressDot', {})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2'})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3'})   
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '/' })
    ctx = await c(ctx.aggregate, 'PressDot', {})
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '3' })
    ctx = await c(ctx.aggregate, 'PressOperator', { operator: '*' })
    ctx = await c(ctx.aggregate, 'PressDigit', { digit: '2'})
    ctx = await c(ctx.aggregate, 'PressEquals', {})
  
    ctx.aggregate.result.should.equal(31.6969696969697)

    console.log(JSON.stringify(tracer.stats))
  })
})
