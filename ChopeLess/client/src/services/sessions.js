
/*
 * Makan Session data.
 * Owner: M3 (front-end).
 * Rules in firestore.rules and server routes: M1.
 *
 * Firestore: sessions/{code}
 *
 * {
 *   code,
 *   hostUid,
 *   status: 'lobby' | 'voting' | 'done',
 *   serviceMode,
 *   voteSeconds,
 *   maxWalkMins,
 *   maxWaitMins,
 *   meetingPoint: { lat, lng, label } | null,
 *   members: { [uid]: { name, budget, dietary } },
 *   shortlist: [place, ...],
 *   votes: { [placeId]: { [uid]: true/false } },
 *   winner: place | null,
 *   createdAt,
 *   expiresAt
 * }
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db, auth } from "../lib/firebase";
import { api } from "../lib/api";

// =====================================================
// GENERATE SESSION CODE
// =====================================================

export function makeCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";

  // No I or O because they resemble 1 and 0.
  return Array.from(
    { length: 6 },
    () => letters[Math.floor(Math.random() * letters.length)]
  ).join("");
}

// =====================================================
// CREATE SESSION
// =====================================================

// Host creates a new Makan Session.
// The host automatically becomes its first member.

export async function createSession(me, groupId = null) {
  if (!auth.currentUser) {
    throw new Error("Please log in before creating a session");
  }

  const uid = auth.currentUser.uid;

  let code = makeCode();

  // Ensure the generated code does not already exist.
  while ((await getDoc(doc(db, "sessions", code))).exists()) {
    code = makeCode();
  }

  await setDoc(doc(db, "sessions", code), {
    code,
    hostUid: uid,

    status: "lobby",
    serviceMode: "dine-in",
    groupId, // which Makan Kakis group started it (null if none)
    voteSeconds: 45, // vote timer, used in Part 4
    maxWalkMins: 10,
    maxWaitMins: 15,

    meetingPoint: null,

    members: {
      [uid]: me,
    },

    createdAt: serverTimestamp(),

    // Session expires after 3 hours.
    expiresAt: Timestamp.fromMillis(
      Date.now() + 3 * 60 * 60 * 1000
    ),
  });

  return code;
}

// =====================================================
// JOIN SESSION
// =====================================================

export async function joinSession(code, me) {
  if (!auth.currentUser) {
    throw new Error("Please log in before joining a session");
  }

  code = code.trim().toUpperCase();

  const ref = doc(db, "sessions", code);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("No session with that code");
  }

  if (snap.data().status !== "lobby") {
    throw new Error("Voting has already started");
  }

  await updateDoc(ref, {
    [`members.${auth.currentUser.uid}`]: me,
  });

  return code;
}

// =====================================================
// WATCH SESSION (LIVE UPDATES)
// =====================================================

// Listens for Firestore changes in real time.
// Returns an unsubscribe function.

export function watchSession(code, onChange, onError) {
  return onSnapshot(
    doc(db, "sessions", code),

    (snap) => {
      onChange(
        snap.exists()
          ? { id: snap.id, ...snap.data() }
          : null
      );
    },

    onError
  );
}

// =====================================================
// UPDATE LOBBY SETTINGS
// =====================================================

// The host can change session settings before voting.

export function updateSettings(code, changes) {
  return updateDoc(
    doc(db, "sessions", code),
    changes
  );
}

// =====================================================
// LEAVE SESSION
// =====================================================

// A member removes themselves from the lobby.

export function leaveSession(code) {
  if (!auth.currentUser) {
    throw new Error("Please log in");
  }

  return updateDoc(doc(db, "sessions", code), {
    [`members.${auth.currentUser.uid}`]: deleteField(),
  });
}

// =====================================================
// DELETE SESSION
// =====================================================

// Host deletes the session.

export function endSession(code) {
  return deleteDoc(doc(db, "sessions", code));
}

// =====================================================
// START VOTING
// =====================================================

// Trusted action handled by the Express backend.

export const startVoting = (code) =>
  api(`/sessions/${code}/start`, {
    method: "POST",
  });

// =====================================================
// CAST VOTE
// =====================================================

// special:
// undefined = normal YES/NO vote
// 'super'   = Super Like
// 'veto'    = Veto

export const castVote = (code, placeId, yes, special) =>
  api(`/sessions/${code}/vote`, {
    method: "POST",
    body: { placeId, yes, special },
  });

// Buy one extra Super Like with Makan Points (20 pts, once per session)
export const buyExtraSuperLike = (code) =>
  api(`/sessions/${code}/buy-super-like`, {
    method: "POST"
  });

// Called when the vote timer runs out (Part 4)
export const finishVoting = (code) =>
  api(`/sessions/${code}/finish`, { method: "POST" });

// Join a session if I'm not in it yet; if I already am, just open it
export async function joinOrOpen(code, me) {
  const snap = await getDoc(doc(db, "sessions", code));
  if (!snap.exists()) throw new Error("That session has ended");
  if (snap.data().members?.[auth.currentUser.uid]) return code;
  return joinSession(code, me);
}
