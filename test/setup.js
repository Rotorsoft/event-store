const chai = require('chai')
const firebase = require('@firebase/testing')

chai.should()

const startProject = async (projectId) => {
  const app = firebase.initializeAdminApp({ projectId: projectId })
  const firestore = app.firestore()
  const tenantRef = firestore.doc('/tenants/tenant1')
  await tenantRef.set({ name: 'tenant1' }, { merge: true })
  return firestore
}

const endProject = async (projectId) => {
  // await firebase.clearFirestoreData({ projectId: projectId })
  await Promise.all(firebase.apps().map(app => app.delete()))
}

module.exports = { startProject, endProject }