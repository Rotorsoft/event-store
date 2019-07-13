'use strict'

const { Aggregate, Err } = require('../index')

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
