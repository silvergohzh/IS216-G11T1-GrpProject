<!-- Swipe deck + live tally. Owner: M3 -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { useAuthStore } from '../stores/auth'
import { castVote } from '../services/sessions'
import SwipeCard from '../components/SwipeCard.vue'

const route = useRoute()
const router = useRouter()
const store = useSessionStore()
const auth = useAuthStore()
const code = route.params.code

const card = ref(null)        // the SwipeCard on screen, so the buttons can fling it
const busy = ref(false)       // true while a vote is being sent (stops double votes)
const error = ref('')
const votedHere = ref([])     // places I voted on in this tab (shows the next card instantly)

const places = computed(() => store.session?.shortlist || [])
const votes = computed(() => store.session?.votes || {})
const members = computed(() => Object.entries(store.session?.members || {}))
const myUid = computed(() => auth.user?.uid)

// The next card = the first place I haven't voted on yet.
// Uses the saved votes, so refreshing the page doesn't make me vote again.
const current = computed(() =>
  places.value.find(p => !votedHere.value.includes(p.id) && votes.value[p.id]?.[myUid.value] === undefined)
)
const doneCount = computed(() => places.value.filter(p => votes.value[p.id]?.[myUid.value] !== undefined).length)

async function vote(yes) {
  if (busy.value || !current.value) return
  busy.value = true
  error.value = ''
  const placeId = current.value.id
  votedHere.value.push(placeId)
  try {
    await castVote(code, placeId, yes)
  } catch (err) {
    votedHere.value = votedHere.value.filter(id => id !== placeId) // put the card back
    error.value = err.message
  } finally {
    busy.value = false
  }
}

// Keyboard: → = yes, ← = no
function onKey(e) {
  if (e.key === 'ArrowRight') card.value?.fling(true)
  if (e.key === 'ArrowLeft') card.value?.fling(false)
}

onMounted(() => {
  store.watch(code)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  store.stop()
  window.removeEventListener('keydown', onKey)
})
watch(() => store.session?.status, s => { if (s === 'done') router.push(`/sessions/${code}/winner`) })

// ---- live tally helpers ----
const yesCount = placeId => Object.values(votes.value[placeId] || {}).filter(Boolean).length
function voteClass(placeId, uid) {
  const v = votes.value[placeId]?.[uid]
  if (v === true) return 'bg-green-500 text-white'
  if (v === false) return 'bg-red-100 text-red-600'
  return 'bg-slate-100 text-slate-400' // hasn't voted yet
}
</script>

<template>
  <h1 class="page-title">Swipe to vote</h1>
  <p class="mb-4 text-sm text-slate-500">
    Drag right for yes, left for no, or use ← → on your keyboard · {{ doneCount }}/{{ places.length }} done
  </p>

  <div class="grid gap-4 md:grid-cols-2">
    <div class="overflow-hidden px-1 pb-2">
      <SwipeCard v-if="current" ref="card" :key="current.id" :place="current" @vote="vote" />
      <div v-else-if="places.length" class="card">You've voted on everything. Waiting for the others…</div>
      <p v-else class="card text-slate-500">Loading places…</p>

      <div v-if="current" class="mt-4 flex justify-center gap-6">
        <button class="h-16 w-16 rounded-full border-2 border-red-300 bg-white text-2xl text-red-600 disabled:opacity-40"
                aria-label="No" data-testid="vote-no" :disabled="busy" @click="card?.fling(false)">✕</button>
        <button class="h-16 w-16 rounded-full border-2 border-green-300 bg-white text-2xl text-brand disabled:opacity-40"
                aria-label="Yes" data-testid="vote-yes" :disabled="busy" @click="card?.fling(true)">✓</button>
      </div>
      <p v-if="error" class="error mt-2">{{ error }}</p>
    </div>

    <div class="card">
      <h2 class="mb-1 font-bold">Live tally</h2>
      <ul class="divide-y divide-slate-100">
        <li v-for="p in places" :key="p.id" class="py-3" data-testid="tally-row">
          <div class="flex justify-between text-sm">
            <span class="font-semibold">{{ p.name }}</span>
            <span class="font-mono">{{ yesCount(p.id) }}/{{ members.length }} yes</span>
          </div>
          <div class="mt-1 h-2 rounded-full bg-slate-100">
            <div class="h-2 rounded-full bg-brand transition-all duration-500"
                 :style="{ width: (members.length ? yesCount(p.id) / members.length * 100 : 0) + '%' }"></div>
          </div>
          <div class="mt-2 flex gap-1">
            <span v-for="[uid, m] in members" :key="uid" :title="m.name"
                  class="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold" :class="voteClass(p.id, uid)">
              {{ m.name?.[0]?.toUpperCase() }}
            </span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>