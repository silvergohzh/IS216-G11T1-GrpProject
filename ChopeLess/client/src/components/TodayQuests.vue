<!-- Today's Quests: 4 small goals that reset at midnight (Singapore time). Owner: M3
     Each quest checks a real record from today, so it ticks as soon as you've done it:
       1. Finish a Makan Session      -> an entry in my Meal History from today
       2. Win with your Super Like     -> today a place I ⭐ Super Liked won the session
       3. Check a queue with a photo  -> a crowd report I sent today, or a queue photo I analysed today
       4. Add a Hidden Gem            -> a gem I added today -->
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { listHistory } from '../services/history'
import { dateSG, todaySG } from '../lib/today'
import { questMarkedToday } from '../lib/quests'

const auth = useAuthStore()

const QUESTS = [
  { id: 'session', text: 'Finish a Makan Session',     reward: '+10 pts',         to: '/sessions' },
  { id: 'win',     text: 'Win with your ⭐ Super Like', reward: 'Bragging rights', to: '/sessions' },
  { id: 'queue',   text: 'Check a queue with a photo', reward: '+15 if verified', to: '/queueless' },
  { id: 'gem',     text: 'Add a Hidden Gem',           reward: 'Helps the town',  to: '/gems' }
]

const done = ref({})     // { session: true, ... } for today
const loading = ref(false)

// Firestore timestamps and plain numbers -> "is this from today?"
const isToday = t => !!t && dateSG(typeof t === 'number' ? t : t.toMillis()) === todaySG()

// Did my ⭐ Super Like (free or bought) go to the place that won this session?
async function superLikeWon(uid, code) {
  const snap = await getDoc(doc(db, 'sessions', code))
  const s = snap.data() || {}
  const winnerId = s.winner?.id
  if (!winnerId) return false
  return s.superLikes?.[uid] === winnerId || (s.extraSuperLikeVotes?.[uid] || []).includes(winnerId)
}

// Each check returns true/false. If one fails (e.g. the server is asleep), that quest just stays unticked.
async function check(uid) {
  // 1. My sessions that finished today (Meal History, written by the server when a session ends with a winner)
  const today = (await listHistory(uid).catch(() => [])).filter(h => isToday(h.at))

  const [win, report, gem] = await Promise.all([
    // 2. One of today's sessions was won by the place I Super Liked
    Promise.all(today.map(h => superLikeWon(uid, h.code).catch(() => false))).then(list => list.some(Boolean)),
    // 3. Crowd reports I sent (Janani's API)
    api('/crowd-reports/mine').then(list => list.some(r => isToday(r.createdAt))).catch(() => false),
    // 4. Hidden Gems I added (Jan's gems: each one stores who added it and when)
    getDocs(query(collection(db, 'gems'), where('submittedBy', '==', uid)))
      .then(snap => snap.docs.some(d => isToday(d.data().createdAt))).catch(() => false)
  ])
  return { session: today.length > 0, win, queue: report || questMarkedToday(uid, 'queue-photo'), gem }
}

async function load() {
  done.value = {}
  const uid = auth.user?.uid
  if (!uid) return
  loading.value = true
  done.value = await check(uid)
  loading.value = false
}
// load now, and again when someone logs in, logs out or switches account
watch(() => auth.user?.uid, load, { immediate: true })
// Tab left open past midnight (or you did a quest in another tab)? Check again when you come back to it
onMounted(() => window.addEventListener('focus', load))
onUnmounted(() => window.removeEventListener('focus', load))

const quests = computed(() => QUESTS.map(q => ({ ...q, isDone: !!done.value[q.id] })))
const doneCount = computed(() => quests.value.filter(q => q.isDone).length)
</script>

<template>
  <div class="rounded-3xl bg-ink p-5 text-white" data-testid="today-quests">
    <p class="text-xs font-black tracking-widest text-accent">TODAY'S QUESTS · {{ doneCount }} OF {{ quests.length }}</p>
    <!-- progress bar -->
    <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
      <div class="h-2 rounded-full bg-accent transition-all duration-500" :style="{ width: (doneCount / quests.length) * 100 + '%' }"></div>
    </div>

    <ul class="mt-3 flex flex-col gap-1">
      <li v-for="q in quests" :key="q.id">
        <RouterLink :to="q.to" class="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 font-extrabold hover:bg-white/10"
                    :class="q.isDone ? 'text-[#9aa6c7] line-through' : ''" :data-testid="`quest-${q.id}`">
          <span class="flex items-center gap-2">
            <span class="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 text-xs"
                  :class="q.isDone ? 'border-accent bg-accent text-ink' : 'border-white'" aria-hidden="true">{{ q.isDone ? '✓' : '' }}</span>
            {{ q.text }}<span class="sr-only">{{ q.isDone ? ' (done)' : '' }}</span>
          </span>
          <span class="shrink-0 text-xs" :class="q.isDone ? '' : 'text-accent'">{{ q.reward }}</span>
        </RouterLink>
      </li>
    </ul>

    <p v-if="!auth.isLoggedIn" class="mt-3 text-sm font-bold text-[#9aa6c7]">Log in to track your quests.</p>
    <p v-else-if="doneCount === quests.length" class="mt-3 font-display text-xl text-accent">All done! New quests tomorrow.</p>
    <p v-else class="mt-3 text-sm font-bold text-[#9aa6c7]">Quests reset at midnight.</p>
  </div>
</template>