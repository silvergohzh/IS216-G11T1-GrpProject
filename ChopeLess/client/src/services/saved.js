// Saved places ("Save for later" / ♥). Owner: M3 (Silver)
// Firestore: users/{uid}/saved/{placeId} { placeId, name, cuisine, savedAt }
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

// READ (live): my saved places as { placeId: savedDoc }, updated the moment I save or unsave
export function watchSaved(uid, onChange, onError) {
  return onSnapshot(collection(db, 'users', uid, 'saved'), snap => {
    const map = {}
    snap.docs.forEach(d => { map[d.id] = d.data() })
    onChange(map)
  }, onError)
}

// CREATE: save a place (the place id is the document id, so saving twice can't duplicate it)
export function savePlace(uid, place) {
  return setDoc(doc(db, 'users', uid, 'saved', place.id), {
    placeId: place.id,
    name: place.name,
    cuisine: place.cuisine || '',
    savedAt: serverTimestamp()
  })
}

// DELETE: unsave
export function unsavePlace(uid, placeId) {
  return deleteDoc(doc(db, 'users', uid, 'saved', placeId))
}
