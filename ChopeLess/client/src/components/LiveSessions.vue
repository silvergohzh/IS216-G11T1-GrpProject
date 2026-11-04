<!-- [M3] "Live now": a shortcut back to any Makan Session I'm in that's still going. Owner: M3
     Shown on Home and the Makan Session page, so leaving the vote page by accident is never a dead end,
     and you can see when one of your Makan Kakis groups has started a session. -->
<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { collection, query, where, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const live = ref([])        // [{ code, status, groupName, count }]
const groupNames = {}       // groupId -> group name, so each group is looked up only once
let stop = null

// Listen live, and again when someone logs in, logs out or switches account
watch(() => auth.user?.uid, uid => {
  stop?.()
  stop = null
  live.value = []
  if (!uid) return
  // Sessions expire after 3 hours, so this only fetches the few that are still open
  const openSessions = query(collection(db, 'sessions'), where('expiresAt', '>', Timestamp.now()))
  stop = onSnapshot(openSessions, async snap => {
    // keep the ones I'm in that haven't finished yet
    const mine = snap.docs.map(d => d.data())
      .filter(s => s.members?.[uid] && ['lobby', 'voting', 'revoting'].includes(s.status))
    for (const s of mine) {
      if (s.groupId && !(s.groupId in groupNames)) {
        const g = await getDoc(doc(db, 'groups', s.groupId)).catch(() => null)
        groupNames[s.groupId] = g?.data()?.name || ''
      }
    }
    live.value = mine.map(s => ({
      code: s.code,
      status: s.status,
      groupName: groupNames[s.groupId] || '',
      count: Object.keys(s.members).length
    }))
  }, () => { live.value = [] })   // offline: just hide the banner
}, { immediate: true })
onUnmounted(() => stop?.())

// Lobby -> the lobby page. Voting (or a re-vote) -> straight back to the cards
const linkFor = s => (s.status === 'lobby' ? `/sessions/${s.code}` : `/sessions/${s.code}/vote`)
</script>

<template>
  <div v-if="live.length" class="flex flex-col gap-2" data-testid="live-sessions">
    <RouterLink v-for="s in live" :key="s.code" :to="linkFor(s)"
                class="card card-coral flex flex-wrap items-center justify-between gap-2 !py-3">
      <span>
        <b>● Live now</b> ·
        {{ s.groupName ? `Makan Kakis · ${s.groupName}` : `Makan Session ${s.code}` }} ·
        {{ s.status === 'lobby' ? `${s.count} in the lobby` : 'voting now' }}
      </span>
      <span class="btn-primary text-sm">{{ s.status === 'lobby' ? 'Back to the lobby' : 'Back to voting' }}</span>
    </RouterLink>
  </div>
</template>