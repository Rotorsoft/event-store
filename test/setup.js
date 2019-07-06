const chai = require('chai')
const firebase = require('@firebase/testing')
const { CosmosClient, ConnectionPolicy } = require('@azure/cosmos')
const { Factory } = require('../index')

chai.should()

const init = async (provider = 'firebase') => {
  provider = (process.env.PROVIDER || provider).trim()
  if (provider === 'azure') {
    const policy = new ConnectionPolicy()
    policy.DisableSSLVerification = true
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    const client = new CosmosClient({ endpoint: 'https://localhost:8081/', auth: { masterKey: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==' }, policy })
    return new Factory(client, client)
  } else if (provider === 'firebase') {
    const app = firebase.initializeAdminApp({ projectId: 'project-'.concat(Date.now()) })
    const firestore = app.firestore()
    const tenantRef = firestore.doc('/tenants/tenant1')
    await tenantRef.set({ name: 'tenant1' }, { merge: true })
    return new Factory(firebase, firestore)
  } else {
    console.log(`Invalid provider ${provider}`)
  }
}

const teardown = async () => {
  if (firebase.apps.length) await Promise.all(firebase.apps().map(app => app.delete()))
}

module.exports = { init, teardown }