'use strict'

const { ITracer } = require('../index')

module.exports = class ConsoleTracer extends ITracer {
  constructor () {
    super()
  }

  trace (fn) {
    const { method, context, tenant, handler, error, envelope, lease, ...args } = fn()
    if (error) {
      console.log(`!!! ERROR: ${error}`)
    }
    // if (context) console.log(`  ${method}: ${context.command} - ${JSON.stringify(context.payload)}`)
    //if (lease) console.log(lease)
    //if (handler && envelope.aid === aggId) console.log(`  ${handler} (${thread}) handled ${JSON.stringify(envelope)}`)

    if (method === 'pollStream') {
      console.log(`stream poll on ${context.thread}`)
      console.log(lease)
    }

    if (method === 'commitCursors') {
      console.log(`cursors committed on ${context.thread}`)
      console.log(lease)
    }

    if (method === 'commitEvents') {
      console.log(`events committed on ${context.command}`)
      console.log(context.events)
    }
  }
}