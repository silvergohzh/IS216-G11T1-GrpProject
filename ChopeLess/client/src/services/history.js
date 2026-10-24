// Makan history, written by the server when a session ends. (M3)
// Firestore: users/{uid}/history/{sessionCode} { code, placeId, placeName, cuisine, groupSize, groupId, at }
import { collection, doc, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

// READ: all my past sessions, newest first
export async function listHistory(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'history'))
  return snap.docs.map(d => d.data()).sort((a, b) => b.at - a.at)
}

// DELETE: one entry, or all of them
export const deleteHistoryItem = (uid, code) => deleteDoc(doc(db, 'users', uid, 'history', code))
export async function clearHistory(uid) {
  const items = await listHistory(uid)
  await Promise.all(items.map(h => deleteHistoryItem(uid, h.code)))
}
