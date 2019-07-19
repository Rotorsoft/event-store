@rotorsoft/event-store

[![NPM Version](https://img.shields.io/npm/v/@rotorsoft/event-store.svg)](https://www.npmjs.com/package/@rotorsoft/event-store)
[![Build Status](https://dev.azure.com/rotorsoft-org/event-store/_apis/build/status/Rotorsoft.event-store?branchName=master)](https://dev.azure.com/rotorsoft-org/event-store/_build/latest?definitionId=1&branchName=master) [![Coverage Status](https://coveralls.io/repos/github/Rotorsoft/event-store/badge.svg)](https://coveralls.io/github/Rotorsoft/event-store)
=========

The original module **@rotorsoft/firestore-event-store** was a proof of concept, just trying to figure out if a low cost cloud based serverless platform could support a number of PWA apps. This is a fork at version 3.1.1, and the new goal is to try other major cloud platforms: Azure (CosmosDB store), AWS (DynamoDB store), MongoDB Atlas, etc.

The right mix of Serverless, DDD, Event Sourcing, and CQRS is probably the best approach to most business oriented software developmet today. This module follows the [CQRS](http://codebetter.com/gregyoung/2012/09/09/cqrs-is-not-an-architecture-2/) pattern proposed by Greg Young around 2010. The [Architecture](#architecture) section depicts the logical architecture using the colors of [Event Storming](https://en.wikipedia.org/wiki/Event_storming), a methodology invented by Alberto Brandolini in the context of DDD.

One of the great advantages of Event Sourcing is having a "replayable history". With proper instrumentation you can easily solve problems like:

* Testing the application at any point in time
* Integrating to other systems by just resending events to a new handler
* Recreating or creating new projections when requirements change
* Keeping documentation in sync with the source code - Self documenting code

The current model supports multiple tenants where actors can carry multiple roles.

Users should adapt their apps to the event delivery mechanisms supported by their cloud provider of choice. The Event Reader interface can be implemented as an optional tool to process ordered events from the store.  

## Settings

Each cloud provider will require some specific settings to secure and/or index the store. 

### Firestore settings

##### firestore.indexes.json

````json
{
  "indexes": [
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "aid", "mode": "ASCENDING" },
        { "fieldPath": "id", "mode": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
````

##### firestore.rules

````js
service cloud.firestore {
  match /databases/{database}/documents {
    // only via admin api
    match /{document=**} {
      allow read, write: if false;
    }
    
    // only authenticated users can read tenant document
    match /tenants/{tenant} {
      allow read: if request.auth != null && request.auth.token != null && request.auth.token.tenant == tenant;
    }
    
    // only authenticated users can read snapshots
    match /tenants/{tenant}/{snapshots}/{snapshot} {
      allow read: if request.auth != null && request.auth.token != null && request.auth.token.tenant == tenant;
    }
  }
}
````
## Architecture

Command Query Resposibility Segregation Reference Architecture

![CQRS](/assets/CQRSArchitecture.PNG)

## Installation

  `npm install @rotorsoft/event-store`

## Usage

A trivial aggregate and event handler using Firestore:

```javascript
const firebase = require('firebase')
const { Factory, Actor, Aggregate, IEventHandler, Err } = require('@rotorsoft/event-store')

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

class EventCounter extends IEventHandler {
  constructor(db) {
    super()
    this.db = db
  }

  async count () {
    const path = '/counters/counter1'
    let snap = await this.db.doc(path).get()
    let doc = snap.data() || {}
    doc.eventCount = (doc.eventCount || 0) + 1
    return await this.db.doc(path).set(doc)
  }

  get events () {
    return {
      [EVENTS.NumbersAdded]: async (tenant, event) => {
        return await this.count()
      },
      [EVENTS.NumbersSubtracted]: async (tenant, event) => {
        return await this.count()
      }
    }
  }
}

const factory = new Factory(firebase, firebase.firestore())
const ch = factory.createCommandHandler([Calculator])
const sr = factory.createStreamReader()
let actor = new Actor({ id: 'user1', name: 'actor 1', tenant: 'tenant1', roles: ['manager', 'user'] })
let context = await ch.command(actor, 'AddNumbers', { number1: 1, number2: 2, aggregateId: 'calc1' })
context = await ch.command(actor, 'AddNumbers', { number1: 3, number2: 4, aggregateId: context.aggregateId, expectedVersion: context.aggregate.aggregateVersion })
context = await ch.command(actor, 'SubtractNumbers', { aggregateId: 'calc1', number1: 1, number2: 1 })
await sr.poll('tenant1', 'thread1', [new EventCounter(firestore)])
console.log('calculator', context.aggregate)
```

Let's now pretend that we need to build a real basic calculator and store every single key pressed in a ledger for audit purposes. The calculator aggregate might look like this:

```javascript
'use strict'

const { Aggregate, Err } = require('@rotorsoft/event-store')

const OPERATORS = {
  ['+']: (l, r) => l + r, 
  ['-']: (l, r) => l - r,
  ['*']: (l, r) => l * r,
  ['/']: (l, r) => l / r
}

const EVENTS = {
  DigitPressed: 'DigitPressed',
  DotPressed: 'DotPressed',
  OperatorPressed: 'OperatorPressed',
  EqualsPressed: 'EqualsPressed' 
}

module.exports = class Calculator extends Aggregate {
  constructor () {
    super()
    this.left = '0'
    this.result = 0
  }

  get commands () { 
    return { 
      PressDigit: async context => {
        if (context.payload.digit < '0' || context.payload.digit > '9') throw Err.invalidArgument('digit')
        context.push(EVENTS.DigitPressed)
      },
      PressDot: async context => {
        context.push(EVENTS.DotPressed)
      },
      PressOperator: async context => {
        if (!Object.keys(OPERATORS).includes(context.payload.operator)) throw Err.invalidArgument('operator')
        context.push(EVENTS.OperatorPressed)
      },
      PressEquals: async context => {
        context.push(EVENTS.EqualsPressed)
      }
    }
  }

  get events () {
    return { 
      [EVENTS.DigitPressed]: event => {
        if (this.operator) {
          this.right = (this.right || '').concat(event.payload.digit)
        }
        else this.left = (this.left || '').concat(event.payload.digit)
      },
      [EVENTS.DotPressed]: event => {
        if (this.operator) {
          this.right = (this.right || '').concat('.')
        }
        else this.left = (this.left || '').concat('.')
      },
      [EVENTS.OperatorPressed]: event => {
        if (this.operator) this.compute()
        this.operator = event.payload.operator
        this.right = null
      },
      [EVENTS.EqualsPressed]: event => {
        this.compute()
      }
    }
  }

  compute () {
    if (!this.left) throw Err.precondition('missing left side')
    if (!this.right) throw Err.precondition('missing right side')
    if (!this.operator) throw Err.precondition('missing operator')
    const l = Number.parseFloat(this.left)
    const r = Number.parseFloat(this.right)
    this.result = OPERATORS[this.operator](l, r)
    this.left = this.result.toString()
  }
}
```
And we can unit test it with chai:

```javascript
'use strict'

const firebase = require('firebase')
const { Factory, Actor, Aggregate, IEventHandler, Err } = require('@rotorsoft/event-store')
const Calculator = require('./calculator')
const actor1 = new Actor({ id: 'user1', name: 'user1', tenant: 'tenant1', roles: [] })

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
        const t = s[context.aggregateType.name] || {}
        const e = t[key] || {} 
        e.time = e.time || Date.now()
        e.count = (e.count || 0) + 1
        t[key] = e
        s[context.aggregateType.name] = t
        this.stats[method] = s
      }
    }
  }
}

const factory = new Factory(firebase, firebase.firestore())
const ch = factory.createCommandHandler([Calculator], new ConsoleTracer())

describe('Calculator basic operations', () => {
  async function c (calc, command, payload) {
    return await ch.command(actor1, command, Object.assign(payload, { aggregateId: calc.aggregateId, expectedVersion: calc.aggregateVersion }))
  }

  it('should compute 1+2-3*5=0', async () => {
    let ctx
    ctx = await ch.command(actor1, 'PressDigit', { digit: '1', aggregateId: 'c1' })
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
    ctx = await ch.command(actor1, 'PressDigit', { digit: '4', aggregateId: 'c2' })
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
    ctx = await ch.command(actor1, 'PressDigit', { digit: '4', aggregateId: 'c3' })
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
    ctx = await ch.command(actor1, 'PressDigit', { digit: '1', aggregateId: 'c4' })
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
    ctx = await ch.command(actor1, 'PressDigit', { digit: '5', aggregateId: 'c5' })
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
```

## Contributing

In lieu of a formal style guide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code.
