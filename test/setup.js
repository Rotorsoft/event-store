const chai = require('chai')
const { Firestore } = require('@google-cloud/firestore')
const { CosmosClient, ConnectionPolicy } = require('@azure/cosmos')
const MongoClient = require('mongodb').MongoClient
const { Factory } = require('../index')

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
  } else {
    console.log(`Invalid provider ${provider}`)
  }
}

const teardown = async () => {
  // if (firebase && firebase.apps.length) await Promise.all(firebase.apps().map(app => app.delete()))
}

module.exports = { init, teardown }