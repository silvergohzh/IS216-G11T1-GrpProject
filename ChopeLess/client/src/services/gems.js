// Hidden Gems data. Owner: M5
// Firestore: gems/{id} { name, mustTry, price, address, lat, lng, dietary, submittedBy, upvoters: [uid], createdAt }
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'

export const UPVOTES_NEEDED = 3

// READ (live): the board updates by itself when anyone adds or upvotes a gem
export function watchGems(onChange, onError) {
  return onSnapshot(collection(db, 'gems'), snap => {
    const gems = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    gems.sort((a, b) => b.upvoters.length - a.upvoters.length)
    onChange(gems)
  }, onError)
}

export function addGem({ name, mustTry, price, address }) {
  return addDoc(collection(db, 'gems'), {
    name, mustTry, price, address,
    lat: null, lng: null, dietary: [],
    submittedBy: auth.currentUser.uid,
    upvoters: [],
    createdAt: serverTimestamp()
  })
}

export function updateGem(id, { name, mustTry, price, address }) {
  return updateDoc(doc(db, 'gems', id), { name, mustTry, price, address })
}

export function deleteGem(id) {
  return deleteDoc(doc(db, 'gems', id))
}

export function upvoteGem(id) {
  return updateDoc(doc(db, 'gems', id), { upvoters: arrayUnion(auth.currentUser.uid) })
}
