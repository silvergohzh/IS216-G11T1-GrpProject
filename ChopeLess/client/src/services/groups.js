// Makan Kakis: saved friend groups. 
// Firestore: groups/{code}
//   { code, name, ownerUid, memberUids: [uid], members: { [uid]: { name } }, activeSession, createdAt }
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, arrayUnion, arrayRemove, deleteField, serverTimestamp
} from 'firebase/firestore'
import { db, auth } from '../lib/firebase'
import { makeCode } from './sessions'

// CREATE: make a new group with me as the owner and only member
export async function createGroup(name, myName) {
  const uid = auth.currentUser.uid
  let code = makeCode()
  while ((await getDoc(doc(db, 'groups', code))).exists()) code = makeCode() // avoid clashes
  await setDoc(doc(db, 'groups', code), {
    code,
    name,
    ownerUid: uid,
    memberUids: [uid],
    members: { [uid]: { name: myName } },
    activeSession: null,
    createdAt: serverTimestamp()
  })
  return code
}

// READ (live): every group I'm in, updated the moment anything changes
export function watchMyGroups(uid, onChange, onError) {
  const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid))
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => d.data())
    list.sort((a, b) => a.name.localeCompare(b.name)) // A to Z
    onChange(list)
  }, onError)
}

// READ (live): one group
export function watchGroup(code, onChange, onError) {
  return onSnapshot(doc(db, 'groups', code), snap => onChange(snap.exists() ? snap.data() : null), onError)
}

// UPDATE: join a group with its code (I can only add myself)
export async function joinGroup(code, myName) {
  code = code.trim().toUpperCase()
  const ref = doc(db, 'groups', code)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('No group with that code')
  if (snap.data().kicked?.[auth.currentUser.uid]) throw new Error('The owner removed you from this group')
  const uid = auth.currentUser.uid
  await updateDoc(ref, { memberUids: arrayUnion(uid), [`members.${uid}`]: { name: myName } })
  return code
}

// UPDATE: owner renames the group
export const renameGroup = (code, name) => updateDoc(doc(db, 'groups', code), { name })

// UPDATE: owner removes someone. They're remembered in `kicked`, so they can't rejoin with the code.
export function removeMember(code, uid) {
  return updateDoc(doc(db, 'groups', code), {
    memberUids: arrayRemove(uid),
    [`members.${uid}`]: deleteField(),
    [`kicked.${uid}`]: true
  })
}

// UPDATE: I leave on my own. Not a kick, so I can come back later.
export const leaveGroup = code => {
  const uid = auth.currentUser.uid
  return updateDoc(doc(db, 'groups', code), { memberUids: arrayRemove(uid), [`members.${uid}`]: deleteField() })
}

// UPDATE: remember the group's live session so other members can join it (Part 2)
export const setActiveSession = (code, sessionCode) =>
  updateDoc(doc(db, 'groups', code), { activeSession: sessionCode })

// DELETE: owner deletes the whole group
export const deleteGroup = code => deleteDoc(doc(db, 'groups', code))