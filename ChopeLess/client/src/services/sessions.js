// Makan Session data. Owner: M3 (front-end). Rules in firestore.rules and server routes: M1.
// Firestore: sessions/{code}
//   { code, hostUid, status: 'lobby'|'voting'|'done', serviceMode, maxWalkMins, maxWaitMins,
//     meetingPoint: { lat, lng, label } | null,
//     members: { [uid]: { name, budget, dietary } },
//     shortlist: [place, ...]            <- written by the server when voting starts
//     votes: { [placeId]: { [uid]: true/false } }   <- written by the server
//     winner: place | null, createdAt, expiresAt }
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'
import { api } from '../lib/api'

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O, they look like 1 and 0
  return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
}

// CREATE: host starts a session and is the first member
export async function createSession(me) {
  const uid = auth.currentUser.uid
  let code = makeCode()
  while ((await getDoc(doc(db, 'sessions', code))).exists()) code = makeCode()

  await setDoc(doc(db, 'sessions', code), {
    code,
    hostUid: uid,
    status: 'lobby',
    serviceMode: 'dine-in',
    maxWalkMins: 10,
    maxWaitMins: 15,
    meetingPoint: null,
    members: { [uid]: me },
    createdAt: serverTimestamp(),
    // Turn on a TTL policy for this field in the Firebase console to auto-delete old sessions
    expiresAt: Timestamp.fromMillis(Date.now() + 3 * 60 * 60 * 1000)
  })
  return code
}

// JOIN: add yourself to members (the rules only let you change your own entry)
export async function joinSession(code, me) {
  code = code.trim().toUpperCase()
  const ref = doc(db, 'sessions', code)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('No session with that code')
  if (snap.data().status !== 'lobby') throw new Error('Voting has already started')
  await updateDoc(ref, { [`members.${auth.currentUser.uid}`]: me })
  return code
}

// READ (live): calls onChange every time anything in the session changes
export function watchSession(code, onChange, onError) {
  return onSnapshot(doc(db, 'sessions', code), snap => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  }, onError)
}

// UPDATE: host changes settings in the lobby
export function updateSettings(code, changes) {
  return updateDoc(doc(db, 'sessions', code), changes)
}

// DELETE: host ends the session
export function endSession(code) {
  return deleteDoc(doc(db, 'sessions', code))
}

// Trusted actions go through the server (M1)
export const startVoting = code => api(`/sessions/${code}/start`, { method: 'POST' })
export const castVote = (code, placeId, yes) => api(`/sessions/${code}/vote`, { method: 'POST', body: { placeId, yes } })
