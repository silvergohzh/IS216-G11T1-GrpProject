// Profile data in Firestore: users/{uid}. Owner: M6
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

export function saveProfile(uid, { name, defaultBudget, dietary }) {
  return setDoc(doc(db, 'users', uid), { name, defaultBudget, dietary }, { merge: true })
}

export function deleteProfile(uid) {
  return deleteDoc(doc(db, 'users', uid))
}
