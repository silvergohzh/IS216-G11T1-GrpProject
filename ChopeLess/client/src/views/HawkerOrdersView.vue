<!-- Hawker order board: paid orders for my stall, live. Owner: M6 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchStallOrders, nextStatus, orderCode, STATUS_LABELS } from '../services/orders'
import { formatMoney } from '../lib/splitBill'

const auth = useAuthStore()
const orders = ref([])
const error = ref('')
let stopWatching = null

// The button text for each step a hawker can move an order to
const NEXT_BUTTON = {
  paid: 'Start preparing',
  preparing: 'Mark ready',
  ready: 'Mark collected'
}

// The board only shows orders the hawker still has to deal with (not carts, not finished ones)
const activeOrders = computed(() =>
  orders.value.filter(o => o.status === 'paid' || o.status === 'preparing' || o.status === 'ready')
)

onMounted(() => {
  // Live: a new paid order appears here the moment the webhook marks it as paid
  stopWatching = watchStallOrders(auth.user.placeId, list => (orders.value = list), err => (error.value = err.message))
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

async function moveOn(order) {
  error.value = ''
  try {
    await nextStatus(order.id)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <h1 class="page-title">Order board</h1>
  <p class="mb-4 text-slate-600">Paid pickup orders for your stall. New orders appear here automatically.</p>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <p v-if="activeOrders.length === 0" class="card text-slate-500">No orders right now.</p>
  <ul class="grid gap-3 md:grid-cols-2">
    <li v-for="o in activeOrders" :key="o.id" class="card space-y-2" data-testid="board-order">
      <div class="flex items-center justify-between">
        <p class="text-xl font-extrabold">{{ orderCode(o.id) }}</p>
        <span class="rounded-full bg-brand-light px-3 py-1 text-sm font-semibold text-brand">{{ STATUS_LABELS[o.status] }}</span>
      </div>
      <ul class="text-sm">
        <li v-for="item in o.items" :key="item.lineId">{{ item.qty }} × {{ item.name }}</li>
      </ul>
      <div class="flex items-center justify-between">
        <span class="text-sm text-slate-500">{{ formatMoney(o.total) }} · {{ o.members[0].name }}</span>
        <button class="btn-primary text-sm" @click="moveOn(o)">{{ NEXT_BUTTON[o.status] }}</button>
      </div>
    </li>
  </ul>
</template>
