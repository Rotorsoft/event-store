const chai = require('chai')
const { Firestore } = require('@google-cloud/firestore')
const { CosmosClient, ConnectionPolicy } = require('@azure/cosmos')
const MongoClient = require('mongodb').MongoClient
const AWS = require('aws-sdk')
const Factory = require('./Factory')

chai.should()

const init = async (provider = 'firebase') => {
  provider = (process.env.PROVIDER || provider).trim()
  if (provider === 'azure') {
    const policy = new ConnectionPolicy()
    policy.DisableSSLVerification = true
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    const cosmos = new CosmosClient({ endpoint: 'https://localhost:8081/', auth: { masterKey: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==' }, policy })
    return new Factory(cosmos)
  } else if (provider === 'firebase') {
    const projectId = 'project-'.concat(Date.now())
    const firestore = new Firestore({
      port: 8080,
      projectId,
      servicePath: 'localhost'
    });
    // const app = admin.initializeApp({ projectId })
    // const firestore = app.firestore()
    const tenantRef = firestore.doc('/tenants/tenant1')
    await tenantRef.set({ name: 'tenant1' }, { merge: true })
    return new Factory(firestore)
  } else if (provider === 'mongodb') {
    const mongo = await MongoClient.connect('mongodb://localhost/', { useNewUrlParser: true })
    return new Factory(mongo)
  } else if (provider === 'dynamodb') {
    AWS.config.update({
      region: "us-west-2",
      endpoint: "http://localhost:8000"
    })
    const dynamo = new AWS.DynamoDB({ apiVersion: '2012-08-10' })
    const eventsTable = {
      AttributeDefinitions: [
        { AttributeName: 'aid', AttributeType: 'S' },
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'gid', AttributeType: 'S' },
        { AttributeName: 'grp', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: 'aid', KeyType: 'HASH' }, { AttributeName: 'id', KeyType: 'RANGE' }],
      GlobalSecondaryIndexes: [{
        IndexName: 'gid',
        KeySchema: [{ AttributeName: 'grp', KeyType: 'HASH' }, { AttributeName: 'gid', KeyType: 'RANGE' }],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 }
      }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      TableName: 'tenant1_events',
      StreamSpecification: { StreamEnabled: false }
    }
    try { await dynamo.createTable(eventsTable).promise() }
    catch (error) {
      // console.error(error)
    }
    const snapshotsTable = {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      TableName: 'tenant1_snapshots',
      StreamSpecification: { StreamEnabled: false }
    }
    try { await dynamo.createTable(snapshotsTable).promise() } catch (error) {}
    const threadsTable = {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      TableName: 'tenant1_threads',
      StreamSpecification: { StreamEnabled: false }
    }
    try { await dynamo.createTable(threadsTable).promise() } catch (error) {}
    return new Factory(new AWS.DynamoDB.DocumentClient())
  } else {
    console.log(`Invalid provider ${provider}`)
  }
}

const teardown = async () => {
  // if (firebase && firebase.apps.length) await Promise.all(firebase.apps().map(app => app.delete()))
}

module.exports = { init, teardown }