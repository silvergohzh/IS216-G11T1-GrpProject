<!-- Hawker order board: my stall's orders, live. Active tab + History tab. Owner: M6 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchStallOrders, startPreparing, markReady, orderCode, STATUS_LABELS } from '../services/orders'
import { formatMoney } from '../lib/splitBill'
import { askNotificationPermission } from '../lib/notify'
import PickupTimer from '../components/PickupTimer.vue'
import ProofUpload from '../components/ProofUpload.vue'

const auth = useAuthStore()
const orders = ref([])
const tab = ref('active')   // 'active' or 'history'
const error = ref('')
const busy = ref(false)
let stopWatching = null

// [JJYAYY] START: Makan Points engine & priority queue hook-up (built by Myat, see HANDOVER.md)
// Active orders, in the order the hawker should deal with them:
//   1. Paid orders WAITING to be cooked, in queue order: Fastpass (priority) first,
//      then first come, first served (the list is already oldest first).
//      This is the same rule as Janani's priority queue (server/services/priorityQueue.js).
//   2. Orders being prepared
//   3. Orders ready for pickup
const activeOrders = computed(() => {
  const waiting = orders.value.filter(o => o.status === 'paid')
  const fastpass = waiting.filter(o => o.priority)
  const normal = waiting.filter(o => !o.priority)
  const preparing = orders.value.filter(o => o.status === 'preparing')
  const ready = orders.value.filter(o => o.status === 'ready')
  return [...fastpass, ...normal, ...preparing, ...ready]
})
// [JJYAYY] END
// History: collected orders
const historyOrders = computed(() =>
  orders.value.filter(o => o.status === 'collected').reverse() // newest first
)

onMounted(() => {
  askNotificationPermission() // so we can tell the hawker about new orders
  // Live: a new paid order appears here the moment the webhook marks it as paid
  stopWatching = watchStallOrders(auth.user.placeId, list => (orders.value = list), err => (error.value = err.message))
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

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

const prepare = order => run(() => startPreparing(order.id))
const ready = (order, photo) => run(() => markReady(order.id, photo))
</script>

<template>
  <p class="kicker">Hawker HQ</p>
  <h1 class="page-title">Order board</h1>
  <p class="mb-4 text-slate-600">Pickup orders for your stall. New paid orders appear here automatically.</p>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <div class="mb-4 flex gap-2">
    <button class="btn" :class="{ '!bg-ink !text-white': tab === 'active' }" @click="tab = 'active'">Active ({{ activeOrders.length }})</button>
    <button class="btn" :class="{ '!bg-ink !text-white': tab === 'history' }" @click="tab = 'history'">History ({{ historyOrders.length }})</button>
  </div>

  <!-- Active orders -->
  <template v-if="tab === 'active'">
    <p v-if="activeOrders.length === 0" class="card text-slate-500">No orders right now.</p>
    <ul class="grid gap-3 md:grid-cols-2">
      <li v-for="o in activeOrders" :key="o.id" class="card space-y-2" data-testid="board-order"
          :class="{ 'card-sun': o.status === 'paid', '!bg-amber-100': o.status === 'preparing', '!bg-green-200': o.status === 'ready' }">
        <div class="flex items-center justify-between">
          <!-- [NAWAZ] the ⚡ Fastpass badge on the next line -->
          <p class="font-display text-3xl">{{ orderCode(o.id) }} <span v-if="o.priority" class="chip !bg-accent !text-sm" data-testid="fastpass-badge">⚡ Fastpass</span></p>
          <span class="chip !text-sm">{{ STATUS_LABELS[o.status] }}</span>
        </div>
         <ul class="text-base font-extrabold">
          <li v-for="item in o.items" :key="item.lineId">{{ item.qty }} × {{ item.name }}</li>
        </ul>
        <p class="text-sm text-slate-500">{{ formatMoney(o.total) }} · {{ o.members[0].name }}</p>

        <!-- Step 1: start cooking -->
        <button v-if="o.status === 'paid'" class="btn-primary w-full !bg-white" :disabled="busy" @click="prepare(o)">Start preparing</button>

        <!-- Step 2: photo of the packed food, then mark ready (starts the 15-minute timer) -->
        <ProofUpload v-if="o.status === 'preparing'" button-text="Mark ready" :busy="busy" @send="photo => ready(o, photo)" />

        <!-- Step 3: the diner collects it -->
        <div v-if="o.status === 'ready'">
          <PickupTimer :pickup-by="o.pickupBy" />
          <p class="text-sm text-slate-500">Waiting for the diner to collect it.</p>
        </div>

        <RouterLink :to="`/orders/${o.id}`" class="text-sm font-black underline">Details</RouterLink>
      </li>
    </ul>
  </template>

  <!-- History -->
  <template v-else>
    <p v-if="historyOrders.length === 0" class="card text-slate-500">No collected orders yet.</p>
    <ul class="space-y-3">
      <li v-for="o in historyOrders" :key="o.id">
        <RouterLink :to="`/orders/${o.id}`" class="card flex items-center justify-between gap-3 hover:bg-slate-50" data-testid="history-order">
          <div>
            <p class="font-bold">{{ orderCode(o.id) }} · {{ o.members[0].name }}</p>
            <p class="text-sm text-slate-500">
              {{ o.items.length }} item(s) · {{ formatMoney(o.total) }} · collected by {{ o.collectedByName }}
              {{ new Date(o.collectedAt).toLocaleString() }}
            </p>
          </div>
          <span class="text-sm text-brand">View proof</span>
        </RouterLink>
      </li>
    </ul>
  </template>
</template>
