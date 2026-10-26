<!-- Pre-order: pick a stall, join a friend's group order, and see my orders (active + history). Owner: M6 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { listPlaces } from '../services/places'
import { watchMyOrders, createOrder, joinByCode, isFinished, orderCode, STATUS_LABELS } from '../services/orders'
import { formatMoney } from '../lib/splitBill'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const stalls = ref([])        // stalls you can order from
const myOrders = ref([])
const joinCode = ref('')
const error = ref('')
const busy = ref(false)
let stopWatching = null

// Split my orders into ones still going and finished ones (history)
const activeOrders = computed(() => myOrders.value.filter(o => !isFinished(o)))
const pastOrders = computed(() => myOrders.value.filter(o => isFinished(o)))

// The cheapest dish on a stall's menu, e.g. "from $1.80"
function cheapest(stall) {
  let lowest = stall.menu[0].price
  for (const dish of stall.menu) {
    if (dish.price < lowest) lowest = dish.price
  }
  return formatMoney(lowest)
}

onMounted(async () => {
  // Only stalls with a menu can take orders
  const all = await listPlaces()
  stalls.value = all.filter(p => p.menu && p.menu.length > 0)

  // Live list of my orders: updates by itself when a hawker changes the status
  stopWatching = watchMyOrders(auth.user.uid, list => (myOrders.value = list), err => (error.value = err.message))

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

// Start an order at a stall (or reopen my open cart there), then go to it
const startOrder = stall => run(async () => {
  const { id } = await createOrder(stall.id)
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

  <!-- Join a friend's order -->
  <form class="card card-navy mb-6 flex flex-wrap items-end gap-3" @submit.prevent="join">
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
            <p class="font-bold">{{ o.placeName }} <span class="text-slate-400">{{ orderCode(o.id) }}</span></p>
            <p class="text-sm text-slate-500">{{ o.items.length }} item(s) · {{ formatMoney(o.total) }}</p>
          </div>
          <span class="chip !text-sm">{{ STATUS_LABELS[o.status] }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>

  <!-- Pick a stall -->
  <h2 class="mb-2">Order from a stall</h2>
  <p v-if="stalls.length === 0" class="card mb-6 text-slate-500">Loading stalls... (if this stays empty, run <code>npm run seed</code>)</p>
  <ul class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <li v-for="s in stalls" :key="s.id" class="card flex flex-col justify-between gap-2 !pt-0 overflow-hidden" data-testid="stall-card">
      <div>
        <div class="-mx-5 mb-3 h-3 border-b-[3px] border-ink bg-accent" aria-hidden="true"></div>
        <h3 class="text-xl leading-tight">{{ s.name }}</h3>
        <p class="text-sm font-bold">{{ s.cuisine }} · from {{ cheapest(s) }}</p>
        <p class="text-xs text-slate-400">{{ s.address }}</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary flex-1 text-sm" :disabled="busy" @click="startOrder(s)">Order here</button>
        <RouterLink :to="`/stalls/${s.id}`" class="btn text-sm">View menu</RouterLink>
      </div>
    </li>
  </ul>

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
