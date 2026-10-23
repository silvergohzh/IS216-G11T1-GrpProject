<!-- One Makan Kakis group: members, live session, start a session in one tap. Owner: M3 -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { watchGroup, joinGroup, renameGroup, removeMember, leaveGroup, deleteGroup, setActiveSession } from '../services/groups'
import { createSession, joinOrOpen, watchSession } from '../services/sessions'
import { getProfile } from '../services/users'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const code = route.params.code

const group = ref(null)
const loaded = ref(false)
const live = ref(null)     // the group's live Makan Session, if there is one (Part 2)
const error = ref('')
const busy = ref(false)
const copied = ref(false)
let stopGroup = null
let stopLive = null

const isOwner = computed(() => group.value?.ownerUid === auth.user?.uid)
const isMember = computed(() => group.value?.memberUids?.includes(auth.user?.uid))
const members = computed(() => Object.entries(group.value?.members || {}))
const liveCount = computed(() => Object.keys(live.value?.members || {}).length)

onMounted(() => {
 stopGroup = watchGroup(code, g => { group.value = g; loaded.value = true }, err => { error.value = err.message })
})
onUnmounted(() => { stopGroup?.(); stopLive?.() })

// Whenever the group's live session code changes, listen to that session as well
watch(() => group.value?.activeSession, sessionCode => {
  stopLive?.()
  live.value = null
  if (sessionCode) stopLive = watchSession(sessionCode, s => { live.value = s }, () => { live.value = null })
})

// My name, budget and diet from my Profile, so nobody has to type them again
async function myDetails() {
  const p = await getProfile(auth.user.uid).catch(() => null)
  return { name: p?.name || auth.user.name, budget: p?.defaultBudget ?? 8, dietary: p?.dietary || [] }
}

async function run(action) {  // small helper: shows errors and stops double clicks
  error.value = ''
  busy.value = true
  try { await action() } catch (err) { error.value = err.message } finally { busy.value = false }
}

// Part 2: one tap = new session for this group, and everyone in the group sees it live
const startSession = () => run(async () => {
  const sessionCode = await createSession(await myDetails(), code)
  await setActiveSession(code, sessionCode)
  router.push(`/sessions/${sessionCode}`)
})
const joinLive = () => run(async () => {
  const sessionCode = group.value.activeSession
  await joinOrOpen(sessionCode, await myDetails())
  router.push(`/sessions/${sessionCode}`)
})

const joinThisGroup = () => run(async () => joinGroup(code, (await myDetails()).name))
const rename = () => run(async () => {
  const name = prompt('New group name', group.value.name)
  if (name?.trim()) await renameGroup(code, name.trim())
})
const remove = (uid, name) => run(async () => {
  if (confirm(`Remove ${name} from the group?`)) await removeMember(code, uid)
})
const leave = () => run(async () => {
  if (!confirm('Leave this group?')) return
  await leaveGroup(code)
  router.push('/groups')
})
const del = () => run(async () => {
  if (!confirm('Delete this group for everyone?')) return
  await deleteGroup(code)
  router.push('/groups')
})

async function copyCode() {
  await navigator.clipboard.writeText(code)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <p v-if="!loaded">Loading…</p>
  <p v-else-if="!group" class="error">This group doesn't exist any more.</p>

  <div v-else-if="!isMember" class="card text-center">
    <p class="mb-3">You're not in <b>{{ group.name }}</b> yet.</p>
    <button class="btn-primary" :disabled="busy" @click="joinThisGroup">Join this group</button>
  </div>

  <div v-else>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <h1 class="page-title mb-0">{{ group.name }}</h1>
      <span class="font-mono text-brand" data-testid="group-code">{{ code }}</span>
      <button class="btn text-sm" @click="copyCode">{{ copied ? 'Code copied ✓' : 'Copy code' }}</button>
      <button v-if="isOwner" class="btn text-sm" @click="rename">Rename</button>
    </div>
    <p v-if="error" class="error mb-3">{{ error }}</p>

    <!-- Live session banner: updates the moment someone starts one -->
    <div v-if="live && live.status === 'lobby' && live.expiresAt?.toMillis() > Date.now()" class="card mb-4 flex flex-wrap items-center justify-between gap-2 border-red-200 bg-red-50">
      <p><b>● Live session</b> · {{ liveCount }} joined so far</p>
      <button class="btn-primary" :disabled="busy" @click="joinLive">Join live session</button>
    </div>
    <div v-else-if="live && live.status === 'voting'" class="card mb-4 bg-amber-50">
      Voting is in progress for this group.
      <RouterLink :to="`/sessions/${group.activeSession}/vote`" class="font-bold text-brand">Open</RouterLink>
    </div>
    <button v-else class="btn-primary mb-4 w-full md:w-auto" :disabled="busy" @click="startSession">
      Start a Makan Session
    </button>

    <div class="card">
      <h2 class="mb-2 font-bold">Members ({{ members.length }})</h2>
      <ul class="divide-y divide-slate-100" data-testid="group-members">
        <li v-for="[uid, m] in members" :key="uid" class="flex items-center justify-between py-2">
          <span>
            <b>{{ m.name }}</b>
            <span v-if="uid === group.ownerUid" class="ml-1 rounded-full bg-brand-light px-2 py-0.5 text-xs font-bold text-brand">Owner</span>
            <span v-if="uid === auth.user?.uid" class="ml-1 text-xs text-slate-400">(you)</span>
          </span>
          <button v-if="isOwner && uid !== auth.user?.uid" class="text-sm text-red-600" @click="remove(uid, m.name)">Remove</button>
        </li>
      </ul>
    </div>

    <button v-if="isOwner" class="mt-4 text-sm text-red-600" @click="del">Delete group</button>
    <button v-else class="mt-4 text-sm text-red-600" @click="leave">Leave group</button>
  </div>
</template>
