// "I did this today" marks for Today's Quests. Owner: M3
// Used only for actions that leave no record with your name on it
// (e.g. a queue photo analysis is saved without who sent it).
// Saved in this browser as  chopeless:quest:<uid>:<quest id> = "2026-10-29"
import { todaySG } from './today'

const key = (uid, id) => `chopeless:quest:${uid}:${id}`

export function markQuest(uid, id) {
  if (!uid) return   // guests don't have quests
  try { localStorage.setItem(key(uid, id), todaySG()) } catch { /* private mode */ }
}

export function questMarkedToday(uid, id) {
  try { return localStorage.getItem(key(uid, id)) === todaySG() } catch { return false }
}