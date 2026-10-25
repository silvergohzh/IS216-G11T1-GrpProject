<!-- Pop-up alerts about orders, shown on every page. Owner: M6
     - Diners: "Your order is ready!" when the hawker marks it ready.
     - Hawkers: "New paid order" when a diner pays.
     It watches orders live, remembers each order's last status, and alerts when the status changes. -->
<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchMyOrders, watchStallOrders, orderCode } from '../services/orders'
import { sendNotification } from '../lib/notify'

const auth = useAuthStore()
const alerts = ref([])          // the pop-ups on screen: [{ id, text, orderId }]
const lastStatus = new Map()    // orderId -> the status we saw last time
let stopWatching = null

// Show a pop-up for 15 seconds, and a browser notification if allowed
function showAlert(text, orderId) {
  const id = Date.now() + Math.random()
  alerts.value.push({ id, text, orderId })
  setTimeout(() => close(id), 15000)
  sendNotification('ChopeLess', text)
}

function close(id) {
  alerts.value = alerts.value.filter(a => a.id !== id)
}

// Compare each order's status with last time. The first time we see an order we only remember it.
function checkForChanges(orders, isHawker) {
  for (const order of orders) {
    const before = lastStatus.get(order.id)
    if (before !== undefined && before !== order.status) {
      if (!isHawker && order.status === 'ready') {
        showAlert(`Your order ${orderCode(order.id)} is ready! Collect it at ${order.placeName} within 15 minutes.`, order.id)
      }
      if (isHawker && order.status === 'paid') {
        showAlert(`New paid order ${orderCode(order.id)}. Check your order board.`, order.id)
      }
    }
    lastStatus.set(order.id, order.status)
  }
}

// Start (or restart) watching whenever someone logs in or out
watch(() => auth.user, user => {
  if (stopWatching) stopWatching()
  stopWatching = null
  lastStatus.clear()
  if (!user) return

  if (user.role === 'hawker') {
    stopWatching = watchStallOrders(user.placeId, orders => checkForChanges(orders, true))
  } else {
    stopWatching = watchMyOrders(user.uid, orders => checkForChanges(orders, false))
  }
}, { immediate: true })

onUnmounted(() => {
  if (stopWatching) stopWatching()
})
</script>

<template>
  <div class="fixed right-4 top-20 z-[2000] w-80 max-w-[calc(100%-2rem)] space-y-2">
    <div v-for="a in alerts" :key="a.id" class="card border-brand shadow-lg" role="status" data-testid="toast">
      <p class="text-sm font-semibold">{{ a.text }}</p>
      <div class="mt-2 flex gap-2">
        <RouterLink :to="auth.isHawker ? '/hawker' : `/orders/${a.orderId}`" class="btn-primary text-xs" @click="close(a.id)">View</RouterLink>
        <button class="btn text-xs" @click="close(a.id)">Dismiss</button>
      </div>
    </div>
  </div>
</template>
