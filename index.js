'use strict'

const IEventHandler = require('./src/IEventHandler')
const IEventStore = require('./src/IEventStore')
const ITracer = require('./src/ITracer')
const CommandHandler = require('./src/CommandHandler')
const StreamReader = require('./src/StreamReader')
const Aggregate = require('./src/Aggregate')
const Actor = require('./src/Actor')
const Err = require('./src/Err')
const FirestoreEventStore = require('./src/stores/FirestoreEventStore')
const CosmosDbEventStore = require('./src/stores/CosmosDbEventStore')
const MongoDbEventStore = require('./src/stores/MongoDbEventStore')
const DynamoDbEventStore = require('./src/stores/DynamoDbEventStore')

module.exports = {
  Actor,
  Aggregate,
  CommandHandler,
  StreamReader,
  IEventHandler,
  IEventStore,
  ITracer,
  Err,
  FirestoreEventStore,
  CosmosDbEventStore,
  MongoDbEventStore,
  DynamoDbEventStore
}
