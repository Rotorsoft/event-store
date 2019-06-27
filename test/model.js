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

  static get path () { return '/calculators' }

  get commands () { 
    return { 
      AddNumbers: async context => {
        if (!Number.isInteger(context.payload.number1)) throw Err.invalidArgument('number1')
        if (!Number.isInteger(context.payload.number2)) throw Err.invalidArgument('number2')
        this.push(EVENTS.NumbersAdded, context.payload)
      },
      SubtractNumbers: async context => {
        if (!Number.isInteger(context.payload.number1)) throw Err.invalidArgument('number1')
        if (!Number.isInteger(context.payload.number2)) throw Err.invalidArgument('number2')
        this.push(EVENTS.NumbersSubtracted, context.payload)
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
  static get path () { return '' }
}

class EventCounter extends IEventHandler {
  constructor(db, name) {
    super()
    this.db = db
    this._name_ = name
  }

  get name () { return this._name_ }
  
  async count (tenant, event) {
    const path = '/counters/'.concat(this.name)
    let snap = await this.db.doc(path).get()
    let doc = snap.data() || { name: this.name }
    doc.events = doc.events || {}
    doc.events[event.agg_id] = (doc.events[event.agg_id] || 0) + 1
    await this.db.doc(path).set(doc)
  }

  get events () {
    return {
      [EVENTS.NumbersAdded]: async (tenant, event) => {
        return await this.count(tenant, event)
      }
    }
  }
}

module.exports = {
  Calculator,
  Calculator2,
  EventCounter
}