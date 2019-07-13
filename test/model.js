'use strict'

const { Aggregate, IEventHandler, Err } = require('../index')

const EVENTS = {
  NumbersAdded: 'NumbersAdded',
  NumbersSubtracted: 'NumbersSubtracted'
}

class Calculator extends Aggregate {
  constructor () {
    super()
    this.sum = 0
  }

  get commands () {
    return { 
      AddNumbers: async context => {
        if (!Number.isInteger(context.payload.number1)) throw Err.invalidArgument('number1')
        if (!Number.isInteger(context.payload.number2)) throw Err.invalidArgument('number2')
        context.push(EVENTS.NumbersAdded)
      },
      SubtractNumbers: async context => {
        if (!Number.isInteger(context.payload.number1)) throw Err.invalidArgument('number1')
        if (!Number.isInteger(context.payload.number2)) throw Err.invalidArgument('number2')
        context.push(EVENTS.NumbersSubtracted)
      }
    }
  }

  get events () {
    return { 
      [EVENTS.NumbersAdded]: event => {
        this.sum += (event.payload.number1 + event.payload.number2)
      },
      [EVENTS.NumbersSubtracted]: event => {
        this.sum -= (event.payload.number1 + event.payload.number2)
      }
    }
  }
}

class Calculator2 extends Calculator {
  static get snapshot () { return false }
}

class EventCounter extends IEventHandler {
  constructor(cache, name) {
    super()
    this.cache = cache
    this._name_ = name
  }

  get name () { return this._name_ }
  
  async count (tenant, event, envelope) {
    const path = '/counters/'.concat(this.name)
    let doc = this.cache.get(path) || { name: this.name }
    doc.events = doc.events || {}
    doc.events[envelope.aid] = (doc.events[envelope.aid] || 0) + 1
    this.cache.set(path, doc)
  }

  get events () {
    return {
      [EVENTS.NumbersAdded]: async (tenant, event, envelope) => {
        return await this.count(tenant, event, envelope)
      }
    }
  }
}

module.exports = {
  Calculator,
  Calculator2,
  EventCounter
}