<!-- Pre-order: pick a place (or a stall inside a hawker centre / food court), join a friend's
     group order, and see my orders (active + history). Owner: M6
     From a Makan Session (/orders?session=CODE) it only shows the place the group picked,
     and everyone in the session is added to the order automatically. -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { listPlaces } from '../services/places'
import {
  watchMyOrders, createOrder, joinByCode, isFinished, orderCode, STATUS_LABELS,
  getStall, listStallsInside, getSession
} from '../services/orders'
import { formatMoney } from '../lib/splitBill'
import PlaceTag from '../components/PlaceTag.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const places = ref([])        // places on the main list: hawker centres, food courts, restaurants
// [SILVER] centre / centreStalls: the hawker centre or food court I opened
const centre = ref(null)      // the hawker centre / food court I opened (null = none)
const centreStalls = ref([])  // the stalls inside it
const session = ref(null)     // the Makan Session, if I came from one
const myOrders = ref([])
const joinCode = ref('')
const error = ref('')
const busy = ref(false)
let stopWatching = null

// Split my orders into ones still going and finished ones (history)
const activeOrders = computed(() => myOrders.value.filter(o => !isFinished(o)))
const pastOrders = computed(() => myOrders.value.filter(o => isFinished(o)))
const groupSize = computed(() => (session.value ? Object.keys(session.value.members).length : 0))

// [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md)
// A hawker centre or food court has stalls inside it instead of its own menu
function isCentre(place) {
  return place.type === 'hawker-centre' || place.type === 'food-court'
}
// [SILVER] END

// The cheapest dish on a menu, e.g. "from $1.80"
function cheapest(place) {
  let lowest = place.menu[0].price
  for (const dish of place.menu) {
    if (dish.price < lowest) lowest = dish.price
  }
  return formatMoney(lowest)
}

// [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md)
// Open a hawker centre or food court: show only the stalls inside it
async function openCentre(place) {
  centre.value = place
  centreStalls.value = await listStallsInside(place.id)
}

function closeCentre() {
  centre.value = null
  centreStalls.value = []
}
// [SILVER] END

onMounted(async () => {
  // Live list of my orders: updates by itself when a hawker changes the status
  stopWatching = watchMyOrders(auth.user.uid, list => (myOrders.value = list), err => (error.value = err.message))

  if (route.query.session) {
    // From a Makan Session: only show the place the group picked
    session.value = await getSession(route.query.session)
    if (!session.value || !session.value.winner) {
      error.value = 'This Makan Session has no winner yet.'
      return
    }
    const winner = await getStall(session.value.winner.id)
    if (!winner) {
      error.value = "The place your group picked can't take pre-orders."
      return
    }
    // [SILVER] a Makan Session that picked a centre opens its stalls
    if (isCentre(winner)) await openCentre(winner)
    else if (winner.menu.length > 0) places.value = [winner]
    else error.value = `${winner.name} doesn't take pre-orders yet. You can still head there!`
  } else {
    // Normal: every hawker centre, food court, and restaurant that has a menu
    const all = await listPlaces()
    places.value = all.filter(p => isCentre(p) || (p.menu && p.menu.length > 0))
  }

  // Opened a shared link like /orders?join=KQWTRM? Join that group order straight away.
  if (route.query.join) {
    joinCode.value = route.query.join
    join()
  }
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

// Runs a server call, shows any error, and disables buttons while waiting
async function run(action) {
  error.value = ''
  busy.value = true
  try {
    await action()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

// Start an order (or reopen my open cart there), then go to it.
// From a Makan Session, the whole group is added to the order.
const startOrder = place => run(async () => {
  const sessionCode = session.value ? session.value.code : undefined
  const { id } = await createOrder(place.id, sessionCode)
  router.push(`/orders/${id}`)
})

// Join a friend's group order with their 6-letter code
const join = () => run(async () => {
  const { id } = await joinByCode(joinCode.value)
  router.push(`/orders/${id}`)
})
</script>

<template>
  <p class="kicker">Station 5 · Tingkat Pier</p>
  <h1 class="page-title">Pre-order for pickup</h1>
  <p class="mb-4 text-slate-600">Order ahead, pay online, and collect when it's ready. Order as a group with a join code.</p>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <!-- Came from a Makan Session -->
  <section v-if="session" class="card card-navy mb-6 space-y-1" data-testid="session-banner">
    <p class="font-bold">Group pre-order for your Makan Session</p>
    <p class="text-sm">Your group picked <b>{{ session.winner?.name }}</b>. All {{ groupSize }} of you are added to the order, so everyone can add their food.</p>
    <RouterLink :to="`/sessions/${session.code}/winner`" class="text-sm font-black underline">Not pre-ordering? Skip this and just head there →</RouterLink>
  </section>

  <!-- Join a friend's order -->
  <form v-else class="card card-navy mb-6 flex flex-wrap items-end gap-3" @submit.prevent="join">
    <div class="min-w-48 flex-1">
      <label class="label !text-white" for="join-code">Join a group order</label>
      <input id="join-code" v-model="joinCode" required maxlength="6" placeholder="6-letter code, e.g. KQWTRM"
             class="input uppercase text-ink" data-testid="join-input" />
    </div>
    <button class="btn-primary" type="submit" :disabled="busy">Join</button>
  </form>

  <!-- My orders that are still going -->
  <section v-if="activeOrders.length > 0" class="mb-6">
    <h2 class="mb-2">My active orders</h2>
    <ul class="space-y-3">
      <li v-for="o in activeOrders" :key="o.id">
        <RouterLink :to="`/orders/${o.id}`" class="card flex items-center justify-between gap-3 !bg-[#7bc96f] transition hover:translate-x-1" data-testid="active-order">
          <div>
            <!-- [NAWAZ] ⚡ on the next line = this order has a Fastpass -->
            <p class="font-bold">{{ o.placeName }} <span class="text-slate-400">{{ orderCode(o.id) }}</span> <span v-if="o.priority">⚡</span></p>
            <p class="text-sm text-slate-500">{{ o.items.length }} item(s) · {{ formatMoney(o.total) }}</p>
          </div>
          <span class="chip !text-sm">{{ STATUS_LABELS[o.status] }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>

  <!-- [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md) -->
  <!-- Inside a hawker centre / food court: only its stalls -->
  <section v-if="centre" class="mb-6">
    <!-- A yellow banner so it's clear you've "entered" the centre -->
    <div class="card card-sun mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="kicker">You're inside</p>
        <h2 class="text-3xl">Stalls in {{ centre.name }}</h2>
        <p class="font-bold">{{ centreStalls.length }} stalls · pick one to pre-order</p>
      </div>
      <div class="flex items-center gap-2">
        <PlaceTag :type="centre.type" />
        <button v-if="!session" class="btn text-sm" @click="closeCentre">← All places</button>
      </div>
    </div>
    <p v-if="centreStalls.length === 0" class="card text-slate-500">No stalls here yet.</p>
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="(s, i) in centreStalls" :key="s.id" class="card flex flex-col justify-between gap-2 !pt-0 overflow-hidden" data-testid="stall-card">
        <div>
          <!-- green strip = a stall inside a centre (place cards use yellow) -->
          <div class="-mx-5 mb-3 h-3 border-b-[3px] border-ink bg-[#7bc96f]" aria-hidden="true"></div>
          <div class="flex items-center gap-2">
            <!-- stall number, same round badge as the island stations -->
            <span class="grid h-8 w-8 place-items-center rounded-full border-[3px] border-ink bg-white font-display" aria-hidden="true">{{ i + 1 }}</span>
            <PlaceTag type="stall" />
          </div>
          <h3 class="mt-1 text-xl leading-tight">{{ s.name }}</h3>
          <p class="text-sm font-bold">{{ s.cuisine }} · from {{ cheapest(s) }}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-primary flex-1 text-sm" :disabled="busy" @click="startOrder(s)">Order here</button>
          <RouterLink :to="`/stalls/${s.id}`" class="btn text-sm">View menu</RouterLink>
        </div>
      </li>
    </ul>
  </section>
  <!-- [SILVER] END -->

  <!-- All places: hawker centres, food courts and restaurants -->
  <section v-else class="mb-6">
    <h2 class="mb-2">{{ session ? 'Your group\'s pick' : 'Where do you want to order from?' }}</h2>
    <p v-if="places.length === 0 && !error" class="card text-slate-500">Loading places... (if this stays empty, run <code>npm run seed</code>)</p>
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="p in places" :key="p.id" class="card flex flex-col justify-between gap-2 !pt-0 overflow-hidden" data-testid="place-card">
        <div>
          <div class="-mx-5 mb-3 h-3 border-b-[3px] border-ink bg-accent" aria-hidden="true"></div>
          <!-- [SILVER] place tag; centres get a See stalls button below -->
          <PlaceTag :type="p.type" />
          <h3 class="mt-1 text-xl leading-tight">{{ p.name }}</h3>
          <p v-if="isCentre(p)" class="text-sm font-bold">Many stalls inside</p>
          <p v-else class="text-sm font-bold">{{ p.cuisine }} · from {{ cheapest(p) }}</p>
          <p class="text-xs text-slate-400">{{ p.address }}</p>
        </div>
        <button v-if="isCentre(p)" class="btn-primary text-sm" @click="openCentre(p)">See stalls</button>
        <div v-else class="flex gap-2">
          <button class="btn-primary flex-1 text-sm" :disabled="busy" @click="startOrder(p)">Order here</button>
          <RouterLink :to="`/stalls/${p.id}`" class="btn text-sm">View menu</RouterLink>
        </div>
      </li>
    </ul>
  </section>

  <!-- Finished orders -->
  <section>
    <h2 class="mb-2">Order history</h2>
    <p v-if="pastOrders.length === 0" class="text-slate-500">No finished orders yet.</p>
    <ul class="space-y-3">
      <li v-for="o in pastOrders" :key="o.id">
        <RouterLink :to="`/orders/${o.id}`" class="card flex items-center justify-between gap-3 transition hover:translate-x-1" data-testid="past-order">
          <div>
            <p class="font-bold">{{ o.placeName }} <span class="text-slate-400">{{ orderCode(o.id) }}</span></p>
            <p class="text-sm text-slate-500">
              {{ o.items.length }} item(s) · {{ formatMoney(o.total) }}
              <span v-if="o.collectedAt"> · collected {{ new Date(o.collectedAt).toLocaleString() }}</span>
            </p>
          </div>
          <span class="chip !text-sm">{{ STATUS_LABELS[o.status] }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
