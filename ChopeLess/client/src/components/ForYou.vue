<!-- "For You": an endless, swipeable row of picks on the Home page. Owner: M3
     - Ranks every place by how similar it is to places you've eaten at or saved (cuisine, price, diet, distance)
     - Keeps loading more cards as you scroll sideways
     - ↻ Refresh shuffles in different picks; logged in: ✕ hides a place, ♥ saves it for later (stored in Firestore)
     - Guests can browse (public places only); tapping ♥ asks them to log in -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'
import { listPlaces } from '../services/places'
import { listHistory } from '../services/history'
import { watchSaved, savePlace, unsavePlace } from '../services/saved'

const auth = useAuthStore()
const router = useRouter()
const uid = auth.user?.uid   // undefined for guests: they can browse, but not save

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

// ---------- carousel: ‹ › arrows and dots ----------
const CARD = 252                  // one card = 240px wide + 12px gap
const atStart = ref(true)         // hide ‹ at the start
const atEnd = ref(false)          // hide › at the end
const activeIndex = ref(0)        // which card is at the front (for the dots)

function onScroll() {
  const el = scroller.value
  if (!el) return
  atStart.value = el.scrollLeft < 10
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10
  activeIndex.value = Math.round(el.scrollLeft / CARD)
}
function scrollRow(direction) {   // -1 = back, 1 = forward
  scroller.value?.scrollBy({ left: direction * CARD, behavior: 'smooth' })
}
function goTo(i) {                // tap a dot to jump to that card
  scroller.value?.scrollTo({ left: i * CARD, behavior: 'smooth' })
}

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
// Think of it as a ruler: give it two places, it tells you how far apart they are.
function distanceKm(a, b) {
  // No location saved for one of the places: treat it as "infinitely far", so it gets no distance points
  if (!a.lat || !b.lat) return Infinity
 
  const R = 6371                              // Earth's radius in km
  const toRad = d => (d * Math.PI) / 180      // the maths functions need radians, not degrees
 
  // How far apart the two places are, north-south (latitude) and east-west (longitude)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
 
  // Haversine step 1: a value from 0 to 1 for how far apart the points are on the globe
  // (the cos parts shrink east-west distances away from the equator, since the Earth is round)
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
 
  // Haversine step 2: turn that into an angle, then multiply by Earth's radius to get km
  return 2 * R * Math.asin(Math.sqrt(h))
}
 
/*
Find how similar place a is to place b. Returns the points AND the reasons (shown on the card).
  a = the place we're thinking of recommending (e.g. Bodhi Deli)
  b = a place you liked: ate at or saved (e.g. Albert Centre)
Gives points for each thing they have in common, and saves the reasons to show on the card.
Example: Bodhi Deli vs Albert Centre -> similar price (+2), also halal, vegetarian (+2), nearby (+2) = 6
POINTS BREAKDOWN
  Cuisine   same type of food (e.g. both Korean)        +3
  Price     price ranges overlap (e.g. $5-10 & $3-8)    +2
  Diet      each diet tag both have (e.g. halal)        +1 each
  Distance  within 500 m +2, within 1 km +1             +2 max
  ----------------------------------------------------------------
  Min 0, max 7 + number of shared diet tags
  (e.g. halal + vegetarian + vegan shared -> 3 + 2 + 3 + 2 = 10)
*/
function similarity(a, b) {
  let score = 0
  const why = []
 
  // Same cuisine (e.g. both Korean): the strongest sign you'd like it, so +3
  if (a.cuisine && a.cuisine === b.cuisine) { score += 3; why.push(`also ${a.cuisine}`) }
 
  // Price ranges overlap (e.g. $5-10 and $3-8 share $5-8): +2
  //    ?? 0 and ?? 99 are only used when a price is MISSING (real prices are used as they are).
  if ((a.priceMin ?? 0) <= (b.priceMax ?? 99) && (b.priceMin ?? 0) <= (a.priceMax ?? 99)) { score += 2; why.push('similar price') }
 
  // Diet tags both places have (e.g. halal, vegetarian): +1 for each one
  const shared = (a.dietary || []).filter(d => (b.dietary || []).includes(d))
  if (shared.length) { score += shared.length; why.push(`also ${shared.join(', ')}`) }
 
  // Distance: if you liked a place, you probably go to that area often, so nearby places are useful
  const km = distanceKm(a, b)
  if (km <= 0.5) { score += 2; why.push('nearby') }            // within 500 m: +2
  else if (km <= 1) { score += 1; why.push('close by') }       // within 1 km: +1
 
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
    .filter(p => !uid || !hidden.value.includes(p.id))   // guests see every place; logged in: skip ✕ "Not for me" ones
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
watch([loading, tab], async () => { await nextTick(); watchEnd(); onScroll() })
watch(() => visible.value.length, async () => { await nextTick(); onScroll() })   // more cards loaded

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
  // Guests: ask them to log in, then come back to Home (like TikTok asking when you tap ♥)
  if (!uid) return router.push({ name: 'login', query: { next: '/' } })
  try {
    if (saved.value[p.id]) await unsavePlace(uid, p.id)
    else await savePlace(uid, p)
  } catch { /* the heart simply doesn't change */ }
}

onMounted(async () => {
  // Saved places and Meal History are private, so only logged-in users load them
  if (uid) stopSaved = watchSaved(uid, map => { saved.value = map }, () => {})
  try {
    const [all, past] = await Promise.all([
      listPlaces(),                                   // public: anyone can see places
      uid ? listHistory(uid).catch(() => []) : []     // guests have no history
    ])
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
    : hasPersonal.value ? 'Similar to places you ate at or saved. Swipe for more →'
    : uid ? 'Short queues near SMU. Swipe for more →'
    : 'Short queues near SMU. Log in to save ♥ and get picks made for you →'
)
const savedCount = computed(() => Object.keys(saved.value).length)
</script>

<template>
  <section class="mt-8" data-testid="for-you">
    <!-- Header: title, tabs and refresh -->
    <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-4xl">{{ title }}</h2>
        <p class="font-extrabold">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex gap-1 rounded-2xl border-[3px] border-ink bg-white p-1 text-sm font-black">
          <button class="rounded-full px-3 py-1" :class="tab === 'foryou' ? 'bg-ink text-white' : ''"
                  @click="switchTab('foryou')">For you</button>
          <button v-if="uid" class="rounded-full px-3 py-1" :class="tab === 'saved' ? 'bg-ink text-white' : ''"
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

    <!-- Carousel: the sideways row, with ‹ › arrows on top and dots underneath -->
    <div v-else class="relative md:px-14">
    <div ref="scroller" class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-1 md:mx-0 md:px-0"
         style="scrollbar-width: none" @scroll="onScroll">

      <div v-for="r in visible" :key="r.place.id"
           class="group relative h-80 w-60 shrink-0 snap-start overflow-hidden rounded-3xl border-4 border-ink shadow-[0_6px_0_#17213b] transition hover:-translate-y-1 hover:-rotate-1"
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
        <span class="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-2.5 py-1 text-xs font-black text-ink">
          <span class="h-2 w-2 animate-pulse rounded-full" :style="{ background: queueLevel(r.place).dot }"></span>
          {{ queueLevel(r.place).label }}
        </span>

        <!-- ♥ save and ✕ not for me -->
        <div class="absolute right-3 top-3 flex flex-col gap-2">
          <button class="grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink bg-white text-lg transition active:scale-90"
                  :aria-label="saved[r.place.id] ? 'Unsave' : 'Save for later'" data-testid="save-place"
                  @click="toggleSave(r.place)">
            <span :class="saved[r.place.id] ? 'text-red-500' : 'text-slate-400'">{{ saved[r.place.id] ? '♥' : '♡' }}</span>
          </button>
          <button v-if="uid && tab === 'foryou'"
                  class="grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink bg-white text-sm font-black transition active:scale-90"
                  aria-label="Not for me" title="Not for me" @click="hide(r.place.id)">✕</button>
        </div>

        <!-- Dark fade at the bottom so white text is always readable -->
        <div class="pointer-events-none absolute inset-x-0 bottom-0 border-t-4 border-ink bg-white p-3 text-ink">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-80">{{ r.place.cuisine }}</p>
          <h3 class="font-display text-xl leading-tight">{{ r.place.name }}</h3>
          <p class="mt-1 text-sm opacity-90">${{ r.place.priceMin }}–{{ r.place.priceMax }}</p>
          <p class="mt-2 inline-block rounded-full border-2 border-ink bg-sky px-2.5 py-1 text-xs font-black">
            {{ r.reason }}
          </p>
        </div>
      </div>

      <!-- End of the feed: invisible marker that loads more, then an "all caught up" card -->
      <div ref="sentinel" class="w-px shrink-0"></div>
      <div v-if="reachedEnd" class="grid h-80 w-60 shrink-0 snap-start place-items-center rounded-3xl border-4 border-dashed border-ink bg-white p-6 text-center">
        <div>
          <p class="text-4xl">🎉</p>
          <p class="mt-2 font-bold">You're all caught up</p>
          <p class="mb-3 text-sm text-slate-500">{{ feed.length }} places so far</p>
          <button v-if="tab === 'foryou'" class="btn-primary text-sm" @click="refresh">↻ Shuffle again</button>
          <button v-if="uid && tab === 'foryou' && hidden.length" class="mt-2 block w-full text-xs text-slate-500 underline" @click="unhideAll">
            Show {{ hidden.length }} hidden
          </button>
        </div>
      </div>
    </div>

      <!-- ‹ arrow: left edge, middle of the cards -->
      <button v-show="!atStart" aria-label="Previous places" @click="scrollRow(-1)"
      class="absolute left-0 top-40 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border-[3px] border-ink bg-accent text-ink shadow-[0_4px_0_#17213b] transition hover:scale-110 md:grid">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      <!-- › arrow: right edge -->
      <button v-show="!atEnd" aria-label="Next places" @click="scrollRow(1)"
      class="absolute right-0 top-40 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border-[3px] border-ink bg-accent text-ink shadow-[0_4px_0_#17213b] transition hover:scale-110 md:grid">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </button>

      <!-- Dots: the current card is a long dash; tap one to jump there -->
      <div v-if="visible.length > 1 && visible.length <= 12" class="mt-3 flex justify-center gap-1.5">
        <button v-for="(r, i) in visible" :key="r.place.id" :aria-label="`Go to card ${i + 1}`" @click="goTo(i)"
                class="h-1.5 rounded-full transition-all duration-300"
                :class="i === activeIndex ? 'w-6 bg-ink' : 'w-3 bg-white hover:bg-slate-300'"></button>
      </div>
      <p v-else-if="visible.length > 12" class="mt-3 text-center text-xs text-slate-400">
        {{ Math.min(activeIndex + 1, visible.length) }} / {{ visible.length }}
      </p>
    </div>
  </section>
</template>