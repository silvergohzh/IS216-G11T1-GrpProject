<!-- "For You": an endless, swipeable row of picks on the Home page. Owner: M3
     - Ranks every place by how similar it is to places you've eaten at or saved (cuisine, price, diet, distance)
     - Keeps loading more cards as you scroll sideways
     - ↻ Refresh shuffles in different picks, ✕ hides a place, ♥ saves it for later (stored in Firestore) -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth'
import { listPlaces } from '../services/places'
import { listHistory } from '../services/history'
import { watchSaved, savePlace, unsavePlace } from '../services/saved'

const auth = useAuthStore()
const uid = auth.user.uid

const places = ref([])
const history = ref([])
const saved = ref({})          // { placeId: savedDoc }, live from Firestore
const loading = ref(true)
const tab = ref('foryou')      // 'foryou' or 'saved'
const seed = ref(0)            // changes on ↻ Refresh, so the order changes
const PAGE = 6                 // cards added each time you reach the end
const shown = ref(PAGE)
const scroller = ref(null)     // the sideways-scrolling row
const sentinel = ref(null)     // an invisible marker at the end of the row
const broken = ref({})         // photos that failed to load
let stopSaved = null
let observer = null

// ---------- "Not for me": hidden places, remembered on this device ----------
const HIDDEN_KEY = 'chopeless:notForMe'
function loadHidden() {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY)) || [] } catch { return [] }
}
const hidden = ref(loadHidden())
function hide(id) {
  hidden.value = [...hidden.value, id]
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden.value)) } catch { /* private mode */ }
}
function unhideAll() {
  hidden.value = []
  try { localStorage.removeItem(HIDDEN_KEY) } catch { /* private mode */ }
}

// ---------- the recommendation ----------
// Straight-line distance between two places, in km (the "haversine" formula)
function distanceKm(a, b) {
  if (!a.lat || !b.lat) return Infinity
  const R = 6371, toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// How similar two places are, plus the reasons (shown on the card)
function similarity(a, b) {
  let score = 0
  const why = []
  if (a.cuisine && a.cuisine === b.cuisine) { score += 3; why.push(`also ${a.cuisine}`) }
  if ((a.priceMin ?? 0) <= (b.priceMax ?? 99) && (b.priceMin ?? 0) <= (a.priceMax ?? 99)) { score += 2; why.push('similar price') }
  const shared = (a.dietary || []).filter(d => (b.dietary || []).includes(d))
  if (shared.length) { score += shared.length; why.push(`also ${shared.join(', ')}`) }
  const km = distanceKm(a, b)
  if (km <= 0.5) { score += 2; why.push('nearby') } else if (km <= 1) { score += 1; why.push('close by') }
  return { score, why }
}

// A repeatable "random" number between 0 and 1 for each place, which changes when seed changes.
// It mixes the order a little, so ↻ Refresh shows different picks without being fully random.
function jitter(id) {
  const n = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) + seed.value * 97
  const x = Math.sin(n) * 10000
  return x - Math.floor(x)
}

const byId = computed(() => Object.fromEntries(places.value.map(p => [p.id, p])))
const visits = computed(() => {
  const v = {}
  history.value.forEach(h => { v[h.placeId] = (v[h.placeId] || 0) + 1 })
  return v
})
// Places I've eaten at OR saved: these are what "similar to" compares against
const liked = computed(() =>
  [...new Set([...history.value.map(h => h.placeId), ...Object.keys(saved.value)])]
    .map(id => byId.value[id])
    .filter(Boolean)
)

function scorePlace(p) {
  let best = { score: 0, why: [], like: null }
  for (const other of liked.value) {
    if (other.id === p.id) continue
    const s = similarity(p, other)
    if (s.score > best.score) best = { ...s, like: other }
  }
  const wait = p.latest?.waitMins
  const quiet = wait !== undefined && wait <= 10 ? 1 : 0
  const personal = best.score >= 3
  return {
    place: p,
    personal,
    score: (personal ? best.score : 0) + quiet - (visits.value[p.id] || 0),
    reason: personal
      ? `Like ${best.like.name}: ${best.why.slice(0, 2).join(', ')}`
      : wait !== undefined ? `Only ~${wait} min queue right now` : 'Worth a try'
  }
}

// The whole feed, best first. Personal picks come first, then everything else, so it never runs dry.
const feed = computed(() => {
  if (tab.value === 'saved') {
    return Object.keys(saved.value).map(id => byId.value[id]).filter(Boolean)
      .map(p => ({ place: p, personal: true, reason: 'Saved for later ♥' }))
  }
  return places.value
    .filter(p => !hidden.value.includes(p.id))
    .map(scorePlace)
    .sort((a, b) => (b.score + jitter(b.place.id) * 1.5) - (a.score + jitter(a.place.id) * 1.5))
})
const visible = computed(() => feed.value.slice(0, shown.value))
const hasPersonal = computed(() => feed.value.some(r => r.personal))
const reachedEnd = computed(() => shown.value >= feed.value.length)

// ---------- endless scroll: load 6 more when the end marker comes into view ----------
function watchEnd() {
  observer?.disconnect()
  if (!sentinel.value || !scroller.value) return
  observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !reachedEnd.value) shown.value += PAGE
  }, { root: scroller.value, rootMargin: '0px 300px 0px 0px' })
  observer.observe(sentinel.value)
}
watch([loading, tab], async () => { await nextTick(); watchEnd() })

// ---------- buttons ----------
async function refresh() {
  seed.value++
  shown.value = PAGE
  scroller.value?.scrollTo({ left: 0, behavior: 'smooth' })
}
function switchTab(name) {
  tab.value = name
  shown.value = PAGE
  scroller.value?.scrollTo({ left: 0 })
}
async function toggleSave(p) {
  try {
    if (saved.value[p.id]) await unsavePlace(uid, p.id)
    else await savePlace(uid, p)
  } catch { /* the heart simply doesn't change */ }
}

onMounted(async () => {
  stopSaved = watchSaved(uid, map => { saved.value = map }, () => {})
  try {
    const [all, past] = await Promise.all([listPlaces(), listHistory(uid).catch(() => [])])
    places.value = all
    history.value = past
  } catch { /* leave the row empty */ }
  loading.value = false
})
onUnmounted(() => { stopSaved?.(); observer?.disconnect() })

// ---------- looks ----------
// Optional food photos per cuisine: put files in client/public/food/ and list them here,
// e.g. { korean: 'korean.jpg', hawker: 'hawker.jpg' }. A place's own imageUrl always wins.
const CUISINE_PHOTOS = {}

const EMOJI = [
  ['hawker', '🍜'], ['korean', '🍲'], ['indian', '🍛'], ['japanese', '🍣'], ['western', '🍔'],
  ['cafe', '☕'], ['dessert', '🍦'], ['ice', '🍦'], ['malay', '🍢'], ['indonesian', '🍢'],
  ['chinese', '🥟'], ['vegetarian', '🥗'], ['thai', '🌶️'], ['food court', '🍱']
]
const cuisineKey = c => EMOJI.find(([word]) => (c || '').toLowerCase().includes(word))?.[0]
const emojiFor = c => EMOJI.find(([word]) => (c || '').toLowerCase().includes(word))?.[1] || '🍽️'

function photoFor(p) {
  if (broken.value[p.id]) return null
  if (p.imageUrl) return p.imageUrl
  const file = CUISINE_PHOTOS[cuisineKey(p.cuisine)]
  return file ? `/food/${file}` : null
}

const GRADIENTS = [
  ['#237a4b', '#5fa37a'], ['#e0a526', '#f2c45a'], ['#1e2140', '#4a5068'],
  ['#c0392b', '#e67e22'], ['#6c3483', '#a569bd'], ['#117a65', '#48c9b0']
]
function gradientFor(name) {
  const n = [...(name || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const [a, b] = GRADIENTS[n % GRADIENTS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

function queueLevel(p) {
  const w = p.latest?.waitMins
  if (w === undefined) return { label: 'Queue not reported', dot: '#94a3b8' }
  if (w <= 10) return { label: `${w} min queue`, dot: '#22c55e' }
  if (w <= 20) return { label: `${w} min queue`, dot: '#f59e0b' }
  return { label: `${w} min queue`, dot: '#ef4444' }
}

const title = computed(() =>
  tab.value === 'saved' ? 'Saved for later ♥' : hasPersonal.value ? 'For you ✨' : 'Discover 🌿'
)
const subtitle = computed(() =>
  tab.value === 'saved'
    ? 'Places you hearted. Tap ♥ again to remove.'
    : hasPersonal.value ? 'Similar to places you ate at or saved. Swipe for more →' : 'Short queues near SMU. Swipe for more →'
)
const savedCount = computed(() => Object.keys(saved.value).length)
</script>

<template>
  <section class="mt-8" data-testid="for-you">
    <!-- Header: title, tabs and refresh -->
    <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-2xl font-extrabold">{{ title }}</h2>
        <p class="text-sm text-slate-500">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex rounded-full bg-slate-100 p-1 text-sm font-semibold">
          <button class="rounded-full px-3 py-1" :class="tab === 'foryou' ? 'bg-white shadow' : 'text-slate-500'"
                  @click="switchTab('foryou')">For you</button>
          <button class="rounded-full px-3 py-1" :class="tab === 'saved' ? 'bg-white shadow' : 'text-slate-500'"
                  @click="switchTab('saved')">♥ Saved ({{ savedCount }})</button>
        </div>
        <button v-if="tab === 'foryou'" class="btn text-sm" aria-label="Refresh picks" data-testid="for-you-refresh"
                @click="refresh">↻ Refresh</button>
      </div>
    </div>

    <!-- Loading: grey placeholder cards -->
    <div v-if="loading" class="flex gap-3 overflow-hidden">
      <div v-for="n in 3" :key="n" class="h-80 w-60 shrink-0 animate-pulse rounded-3xl bg-slate-200"></div>
    </div>

    <p v-else-if="tab === 'saved' && !feed.length" class="card text-slate-500">
      Nothing saved yet. Tap ♥ on any card to save it for later.
    </p>

    <!-- The endless sideways row: snaps to each card -->
    <div v-else ref="scroller" class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2"
         style="scrollbar-width: none">
      <div v-for="r in visible" :key="r.place.id"
           class="group relative h-80 w-60 shrink-0 snap-start overflow-hidden rounded-3xl shadow-md transition hover:-translate-y-1 hover:shadow-xl"
           :style="{ backgroundImage: gradientFor(r.place.name) }">
        <!-- Photo if there is one, otherwise a big emoji on the colour -->
        <img v-if="photoFor(r.place)" :src="photoFor(r.place)" :alt="r.place.name" loading="lazy"
             class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
             @error="broken[r.place.id] = true" />
        <span v-else class="absolute right-4 top-12 text-7xl transition duration-300 group-hover:rotate-6 group-hover:scale-110">
          {{ emojiFor(r.place.cuisine) }}
        </span>

        <!-- Tapping the card opens the place (below the buttons) -->
        <RouterLink :to="`/places/${r.place.id}`" class="absolute inset-0" :aria-label="`Open ${r.place.name}`"></RouterLink>

        <!-- Live queue badge -->
        <span class="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-ink">
          <span class="h-2 w-2 animate-pulse rounded-full" :style="{ background: queueLevel(r.place).dot }"></span>
          {{ queueLevel(r.place).label }}
        </span>

        <!-- ♥ save and ✕ not for me -->
        <div class="absolute right-3 top-3 flex flex-col gap-2">
          <button class="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-lg shadow transition active:scale-90"
                  :aria-label="saved[r.place.id] ? 'Unsave' : 'Save for later'" data-testid="save-place"
                  @click="toggleSave(r.place)">
            <span :class="saved[r.place.id] ? 'text-red-500' : 'text-slate-400'">{{ saved[r.place.id] ? '♥' : '♡' }}</span>
          </button>
          <button v-if="tab === 'foryou'"
                  class="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-sm text-slate-500 shadow transition active:scale-90"
                  aria-label="Not for me" title="Not for me" @click="hide(r.place.id)">✕</button>
        </div>

        <!-- Dark fade at the bottom so white text is always readable -->
        <div class="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white"
             style="background: linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-80">{{ r.place.cuisine }}</p>
          <h3 class="text-xl font-extrabold leading-tight">{{ r.place.name }}</h3>
          <p class="mt-1 text-sm opacity-90">${{ r.place.priceMin }}–{{ r.place.priceMax }}</p>
          <p class="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">
            {{ r.reason }}
          </p>
        </div>
      </div>

      <!-- End of the feed: invisible marker that loads more, then an "all caught up" card -->
      <div ref="sentinel" class="w-px shrink-0"></div>
      <div v-if="reachedEnd" class="grid h-80 w-60 shrink-0 snap-start place-items-center rounded-3xl border-2 border-dashed border-slate-300 p-6 text-center">
        <div>
          <p class="text-4xl">🎉</p>
          <p class="mt-2 font-bold">You're all caught up</p>
          <p class="mb-3 text-sm text-slate-500">{{ feed.length }} places so far</p>
          <button v-if="tab === 'foryou'" class="btn-primary text-sm" @click="refresh">↻ Shuffle again</button>
          <button v-if="tab === 'foryou' && hidden.length" class="mt-2 block w-full text-xs text-slate-500 underline" @click="unhideAll">
            Show {{ hidden.length }} hidden
          </button>
        </div>
      </div>
    </div>
  </section>
</template>