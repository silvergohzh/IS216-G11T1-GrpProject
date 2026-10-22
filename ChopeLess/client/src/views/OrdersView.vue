<!-- My orders: start a pickup pre-order, and see all my orders (live). Owner: M6 -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { listPlaces } from '../services/places'
import { watchMyOrders, createOrder, orderCode, STATUS_LABELS } from '../services/orders'
import { formatMoney } from '../lib/splitBill'

const auth = useAuthStore()
const router = useRouter()

const places = ref([])        // stalls you can order from
const chosenPlace = ref('')   // the stall picked in the dropdown
const myOrders = ref([])
const error = ref('')
let stopWatching = null

onMounted(async () => {
  // Only stalls with a menu can take orders
  const all = await listPlaces()
  places.value = all.filter(p => p.menu && p.menu.length > 0)

  // Live list of my orders: updates by itself when a hawker changes the status
  stopWatching = watchMyOrders(auth.user.uid, list => (myOrders.value = list), err => (error.value = err.message))
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

// Start a new, empty cart for the chosen stall, then open it
async function startOrder() {
  error.value = ''
  try {
    const { id } = await createOrder(chosenPlace.value)
    router.push(`/orders/${id}`)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <h1 class="page-title">Pre-order for pickup</h1>
  <p class="mb-4 text-slate-600">Order ahead, pay online, and collect when it's ready. Share your cart to order as a group.</p>

  <form class="card mb-6 flex flex-wrap items-end gap-3" @submit.prevent="startOrder">
    <div class="min-w-56 flex-1">
      <label class="label" for="place">Stall</label>
      <select id="place" v-model="chosenPlace" required class="input">
        <option value="" disabled>Choose a stall</option>
        <option v-for="p in places" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <button class="btn-primary" type="submit">Start order</button>
  </form>

  <p v-if="error" class="error mb-4">{{ error }}</p>

  <h2 class="mb-2 font-bold">My orders</h2>
  <p v-if="myOrders.length === 0" class="text-slate-500">No orders yet.</p>
  <ul class="space-y-3">
    <li v-for="o in myOrders" :key="o.id">
      <RouterLink :to="`/orders/${o.id}`" class="card flex items-center justify-between gap-3 hover:bg-slate-50"
                  data-testid="my-order">
        <div>
          <p class="font-bold">{{ o.placeName }} <span class="text-slate-400">{{ orderCode(o.id) }}</span></p>
          <p class="text-sm text-slate-500">{{ o.items.length }} item(s) · {{ formatMoney(o.total) }}</p>
        </div>
        <span class="rounded-full bg-brand-light px-3 py-1 text-sm font-semibold text-brand">{{ STATUS_LABELS[o.status] }}</span>
      </RouterLink>
    </li>
  </ul>
</template>
