<!-- Lobby: see who joined, host sets meeting point and limits, then starts voting. Owner: M3 -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { useAuthStore } from '../stores/auth'
import { updateSettings, startVoting, leaveSession, endSession } from '../services/sessions'
import MapView from '../components/MapView.vue'

const route = useRoute()
const router = useRouter()
const store = useSessionStore()
const auth = useAuthStore()
const code = route.params.code
const error = ref('')
const starting = ref(false)

const copied = ref(false)
const shareLink = `${location.origin}/sessions?join=${code}`

// Copy the invite link so friends can tap it in the group chat
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = 'Could not copy. Share this link instead: ' + shareLink
  }
}

async function leave() {
  if (!confirm('Leave this session?')) return
  await leaveSession(code)
  router.push('/sessions')
}
async function end() {
  if (!confirm('End the session for everyone?')) return
  await endSession(code)
  router.push('/sessions')
}

const isHost = computed(() => store.session?.hostUid === auth.user?.uid)
const members = computed(() => Object.entries(store.session?.members || {}))

onMounted(() => store.watch(code))
onUnmounted(() => store.stop())

// When the host starts voting, every phone moves to the vote page at the same moment
watch(() => store.session?.status, status => {
  if (status === 'voting') router.push(`/sessions/${code}/vote`)
})

async function update(changes) {
  try { await updateSettings(code, changes) } catch (err) { error.value = err.message }
}
async function start() {
  error.value = ''
  starting.value = true
  try { await startVoting(code) } catch (err) { error.value = err.message } finally { starting.value = false }
}
</script>

<template>
  <div v-if="store.session">
    <h1 class="page-title">Lobby · code <span class="font-mono text-brand" data-testid="session-code">{{ code }}</span></h1>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <p class="text-slate-600">Share the code. Voting starts when the host is ready.</p>
      <button class="btn text-sm" data-testid="copy-link" @click="copyLink">{{ copied ? 'Link copied ✓' : 'Copy invite link' }}</button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="card">
        <h2 class="mb-2 font-bold">Members ({{ members.length }})</h2>
        <ul class="divide-y divide-slate-100" data-testid="member-list">
          <li v-for="[uid, m] in members" :key="uid" class="py-2">
            <b>{{ m.name }}</b> 
            <span v-if="uid === store.session.hostUid" class="ml-1 rounded-full bg-brand-light px-2 py-0.5 text-xs font-bold text-brand">Host</span>
            <span v-if="uid === auth.user?.uid" class="ml-1 text-xs text-slate-400">(you)</span>
            <span class="text-sm text-slate-500">· ${{ m.budget }} · {{ m.dietary.join(', ') || 'no restrictions' }}</span>
          </li>
        </ul>
      </div>

      <div class="card space-y-3">
        <h2 class="font-bold">Settings</h2>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="walk">Max walk (min)</label>
            <input id="walk" type="number" class="input" :value="store.session.maxWalkMins" :disabled="!isHost" @change="update({ maxWalkMins: +$event.target.value })" /></div>
          <div><label class="label" for="wait">Max queue (min)</label>
            <input id="wait" type="number" class="input" :value="store.session.maxWaitMins" :disabled="!isHost" @change="update({ maxWaitMins: +$event.target.value })" /></div>
        </div>
        <div><span class="label">Meeting point {{ isHost ? '(tap the map)' : '' }}</span>
          <MapView :markers="store.session.meetingPoint ? [{ ...store.session.meetingPoint, label: 'Meet here' }] : []"
                   @pick="p => isHost && update({ meetingPoint: { ...p, label: 'Meeting point' } })" /></div>
        <p v-if="error" class="error">{{ error }}</p>
        <button v-if="isHost" class="btn-primary w-full" :disabled="starting" @click="start">{{ starting ? 'Building shortlist…' : 'Start voting' }}</button>
        <p v-else class="text-sm text-slate-500">Waiting for the host to start…</p>
        <button v-if="isHost" class="w-full text-sm text-red-600" @click="end">End session for everyone</button>
        <button v-else class="w-full text-sm text-red-600" @click="leave">Leave session</button>
      </div>
    </div>
  </div>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>
  <p v-else>Loading…</p>
</template>
