<!-- Makan Quest home map: one island, one station per feature. Owner: M3
     - Tap a station: the side panel explains it and links in (every station is always open)
     - A tick means you've been there today (aved to your account in Firestore, reset at midnight; guests start fresh)
     - The island is a plain SVG; stations are real buttons placed on top with % positions -->
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { todaySG } from '../lib/today'
import TodayQuests from './TodayQuests.vue'
import { doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../lib/firebase'

const router = useRouter()
const auth = useAuthStore()

// x, y are positions on the 800 x 600 island drawing, so the dots sit on the sand path
const STATIONS = [
  { id: 'kakis',    n: 1, x: 110, y: 470, name: 'Makan Kakis',   to: '/groups',    cta: 'Open my groups',
    text: 'Your regular lunch groups. One tap calls everyone to the table.', rewards: [['Host a session from a group', '+5 pts']] },
  { id: 'queues',   n: 2, x: 310, y: 400, name: 'QueueLess',     to: '/queueless', cta: 'Check queues',
    text: 'Live crowd levels from photos. Know the wait before you walk over.', rewards: [['Verified crowd report', '+15 pts']] },
  { id: 'gems',     n: 3, x: 470, y: 350, name: 'Hidden Gems',   to: '/gems',      cta: 'Explore gems',
    text: 'Stalls only locals know. 3 upvotes and a gem joins everyone’s vote.', rewards: [['Add or upvote a gem', 'helps the town']] },
  { id: 'session',  n: 4, x: 620, y: 250, name: 'Makan Session', to: '/sessions',  cta: 'Start a session',
    text: 'Pick where your group eats. Share a code, everyone swipes, the best match wins.', rewards: [['Finish a session', '+10 pts'], ['Host one', '+5 pts']] },
  { id: 'preorder', n: 5, x: 700, y: 120, name: 'Pre-order',     to: '/orders',    cta: 'Order ahead',
    text: 'Order as a group, split the bill, collect when the stall says ready.', rewards: [['Skip the queue', 'priority at 150 pts']] },
  { id: 'points',   n: 6, x: 200, y: 150, name: 'Makan Points',  to: '/points',    cta: 'See my points',
    text: 'Your points, badges and this week’s leaderboard.', rewards: [['Extra Super Like', '-20 pts']] }
]

// ---------- visited ticks: saved to your ACCOUNT, reset every day ----------
// Saved in Firestore at users/{uid}/visited/{today's date}, so every browser and phone
// you log in on shows the same ticks, live. A new day = a new doc = empty again.
// Guest: nothing is saved, so the ticks start empty every visit.
const day = ref(todaySG())
const uid = computed(() => auth.user?.uid || null)
const visited = ref([])
let stopTicks = null

// Listen to today's doc. Runs again on log in / log out / switch account / new day.
function listenTicks() {
  stopTicks?.()
  stopTicks = null
  visited.value = []
  if (!uid.value) return
  stopTicks = onSnapshot(
    doc(db, 'users', uid.value, 'visited', day.value),
    snap => { visited.value = snap.data()?.ids || [] },
    () => {}                                    // offline or blocked: just show no ticks
  )
}
watch([uid, day], listenTicks, { immediate: true })

// Tab left open past midnight? Check the date again whenever you come back to it
const checkDay = () => { day.value = todaySG() }
onMounted(() => window.addEventListener('focus', checkDay))
onUnmounted(() => {
  window.removeEventListener('focus', checkDay)
  stopTicks?.()                                 // stop listening when you leave Home
})

async function go(s) {
  if (!visited.value.includes(s.id)) {
    visited.value = [...visited.value, s.id]    // show the tick straight away
    if (uid.value) {
      const save = setDoc(doc(db, 'users', uid.value, 'visited', day.value),
                          { ids: arrayUnion(s.id) }, { merge: true })
                     .catch(() => {})
      // Wait for the save (max 1 s), so a quick refresh or closing the tab doesn't lose the tick
      await Promise.race([save, new Promise(resolve => setTimeout(resolve, 1000))])
    }
  }
  router.push(s.to)
}

const selectedId = ref('session')     // start on the main job: Makan Session
const current = computed(() => STATIONS.find(s => s.id === selectedId.value))
const pos = s => ({ left: `${(s.x / 800) * 100}%`, top: `${(s.y / 600) * 100}%` })
const isDone = s => visited.value.includes(s.id)
</script>

<template>
  <div class="flex flex-wrap items-start gap-6">
    <!-- the island -->
    <section class="min-w-0 flex-[999_1_560px]" aria-labelledby="world">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="font-black">World 1 · Bras Basah, near SMU</p>
          <h1 id="world" class="text-4xl leading-none sm:text-5xl">Where we makan today?</h1>
        </div>
        <span class="rounded-full border-[3px] border-ink bg-white px-3 py-1 font-black" data-testid="visited-count">
          {{ visited.length }} of {{ STATIONS.length }} stations visited today
        </span>
      </div>

      <div class="relative aspect-[4/3] overflow-hidden rounded-[2rem] border-4 border-ink bg-[#4aa6d9] shadow-[0_8px_0_#17213b]">
        <svg class="absolute inset-0 h-full w-full" viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true">
          <!-- sand, grass, path (dotted), trees, waves -->
          <path d="M40 520 C10 420 70 330 60 250 C50 140 150 60 280 70 C380 78 430 30 560 40 C690 50 770 120 760 230 C752 320 790 400 740 480 C690 560 560 580 420 570 C300 562 200 590 120 575 C80 568 52 548 40 520 Z" fill="#f6e7b8" />
          <path d="M70 505 C45 420 95 340 88 258 C80 160 170 92 285 100 C385 106 440 62 560 72 C675 82 740 140 730 235 C722 320 758 395 712 462 C668 530 550 548 420 540 C305 532 205 560 130 546 C98 540 78 528 70 505 Z" fill="#7bc96f" />
          <path d="M110 470 C190 400 250 440 310 400 S430 300 470 350 S600 330 620 250 S690 140 700 120" fill="none" stroke="#f6e7b8" stroke-width="26" stroke-linecap="round" />
          <path d="M110 470 C190 400 250 440 310 400 S430 300 470 350 S600 330 620 250 S690 140 700 120" fill="none" stroke="#c9a96b" stroke-width="4" stroke-dasharray="2 16" stroke-linecap="round" />
          <path d="M200 150 C240 190 260 260 310 400" fill="none" stroke="#f6e7b8" stroke-width="18" stroke-linecap="round" />
          <circle cx="160" cy="250" r="30" fill="#4c9e46" /><circle cx="190" cy="270" r="20" fill="#4c9e46" />
          <circle cx="560" cy="470" r="26" fill="#4c9e46" /><circle cx="400" cy="170" r="22" fill="#4c9e46" />
          <path d="M60 60 q20 -14 40 0 q20 14 40 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7" />
          <path d="M640 560 q20 -14 40 0 q20 14 40 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7" />
        </svg>

        <!-- pulsing ring on the selected station -->
        <span class="island-ring pointer-events-none absolute h-20 w-20 rounded-full border-[5px] border-white sm:h-24 sm:w-24"
              :style="pos(current)" aria-hidden="true"></span>

        <template v-for="s in STATIONS" :key="s.id">
          <button type="button"
                  class="absolute z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-ink shadow-[0_5px_0_#17213b] transition hover:scale-110 focus-visible:outline-4 focus-visible:outline-accent"
                  :class="[
                    s.id === selectedId ? 'h-16 w-16 sm:h-[86px] sm:w-[86px]' : 'h-12 w-12 sm:h-[70px] sm:w-[70px]',
                    isDone(s) ? 'bg-accent' : s.id === selectedId ? 'bg-coral' : 'bg-white'
                  ]"
                  :style="pos(s)"
                  :aria-label="`Station ${s.n}, ${s.name}${isDone(s) ? ', visited' : ''}`"
                  :aria-pressed="s.id === selectedId"
                  @click="selectedId = s.id">
            <svg v-if="isDone(s)" class="h-6 w-6 sm:h-8 sm:w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
            <span v-else class="font-display text-xl sm:text-3xl">{{ s.n }}</span>
          </button>
          <span class="pointer-events-none absolute z-0 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border-[3px] border-ink bg-white px-2 text-sm font-black sm:block"
                :style="{ left: pos(s).left, top: `calc(${pos(s).top} + ${s.id === selectedId ? 52 : 44}px)` }">{{ s.name }}</span>
        </template>
      </div>
      <!-- 3 daily goals, reset at midnight (same as the HTML design) -->
      <TodayQuests />
      <p class="mt-2 font-extrabold">Tap any station. All are open: a tick means you've been there today. Ticks reset at midnight, so come back for a new run!</p>
    </section>

    <!-- station panel -->
    <aside class="flex flex-[1_1_300px] flex-col gap-4" aria-live="polite">
      <div class="card flex flex-col gap-3">
        <span class="self-start rounded-full px-3 py-1 text-xs font-black tracking-wider"
              :class="isDone(current) ? 'bg-accent' : 'bg-coral'">
          STATION {{ current.n }} · {{ isDone(current) ? 'VISITED' : 'OPEN' }}
        </span>
        <h2 class="text-4xl leading-none">{{ current.name }}</h2>
        <p class="text-base">{{ current.text }}</p>
        <ul class="flex flex-col gap-2">
          <li v-for="[label, pts] in current.rewards" :key="label"
              class="flex justify-between rounded-xl bg-sky px-3 py-2 font-extrabold">
            <span>{{ label }}</span><span class="text-brand">{{ pts }}</span>
          </li>
        </ul>
        <!-- a real link, so "Start a Makan Session" style tests and screen readers still work -->
        <a :href="current.to" class="btn-primary min-h-14 font-display text-2xl font-normal"
           @click.prevent="go(current)">{{ current.cta }}</a>
      </div>
    </aside>
  </div>
</template>

<style scoped>
@keyframes island-ring {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(1.7); opacity: 0; }
}
.island-ring { animation: island-ring 1.7s ease-out infinite; }
</style>