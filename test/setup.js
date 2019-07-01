const chai = require('chai')
const firebase = require('@firebase/testing')
const { Factory } = require('../index')

chai.should()

const init = async () => {
  const app = firebase.initializeAdminApp({ projectId: 'project-'.concat(Date.now()) })
  const firestore = app.firestore()
  const tenantRef = firestore.doc('/tenants/tenant1')
  await tenantRef.set({ name: 'tenant1' }, { merge: true })
  return new Factory(firebase, firestore)
}

const teardown = async () => {
  // await firebase.clearFirestoreData({ projectId: projectId })
  await Promise.all(firebase.apps().map(app => app.delete()))
}

module.exports = { init, teardown }