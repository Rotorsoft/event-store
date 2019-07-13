'use strict'

const IEventHandler = require('./src/IEventHandler')
const IEventStore = require('./src/IEventStore')
const ITracer = require('./src/ITracer')
const CommandHandler = require('./src/CommandHandler')
const StreamReader = require('./src/StreamReader')
const Aggregate = require('./src/Aggregate')
const Actor = require('./src/Actor')
const Factory = require('./src/Factory')
const Err = require('./src/Err')

module.exports = {
  Factory,
  Actor,
  Aggregate,
  CommandHandler,
  StreamReader,
  IEventHandler,
  IEventStore,
  ITracer,
  Err
}
