<!-- One order: the group cart, split bill, payment and live status. Owner: M6 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import {
  watchOrder, joinOrder, getMenu, addItem, changeQty, removeItem,
  cancelOrder, checkout, orderCode, STATUS_LABELS
} from '../services/orders'
import { splitByItem, splitEqually, formatMoney } from '../lib/splitBill'

const route = useRoute()
const auth = useAuthStore()
const orderId = route.params.id

const order = ref(null)
const menu = ref([])
const error = ref('')
const busy = ref(false)              // true while a button is waiting for the server
const splitMode = ref('item')        // 'item' or 'equal'
const copied = ref(false)
let stopWatching = null

// Handy true/false values for the template
const isOwner = computed(() => order.value && order.value.ownerUid === auth.user.uid)
const isCart = computed(() => order.value && order.value.status === 'cart')
const justPaid = route.query.paid === '1' // Stripe sends people back here with ?paid=1

// Who owes what. Recalculated automatically whenever the cart or the split mode changes.
const shares = computed(() => {
  if (!order.value) return []
  if (splitMode.value === 'equal') return splitEqually(order.value.items, order.value.members)
  return splitByItem(order.value.items, order.value.members)
})

onMounted(async () => {
  try {
    // Opening a shared link adds you to the group cart (does nothing if you are already in it)
    await joinOrder(orderId)
  } catch (err) {
    error.value = err.message
  }
  // Live updates: everyone in the group sees new items, and the status changes, instantly
  stopWatching = watchOrder(orderId, async data => {
    order.value = data
    if (data && menu.value.length === 0) menu.value = await getMenu(data.placeId)
  }, err => (error.value = err.message))
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

const add = dish => run(() => addItem(orderId, dish.id, 1))
const plus = item => run(() => changeQty(orderId, item.lineId, item.qty + 1))
const minus = item => run(() => (item.qty > 1 ? changeQty(orderId, item.lineId, item.qty - 1) : removeItem(orderId, item.lineId)))
const cancel = () => run(() => cancelOrder(orderId))

// Pay: the server gives us a Stripe page to go to. (In demo mode there is no page and the order is paid straight away.)
const pay = () => run(async () => {
  const result = await checkout(orderId)
  if (result.url) window.location.href = result.url
})

// You can only change items you added (the owner can change everything)
function canEdit(item) {
  return isCart.value && (item.addedBy === auth.user.uid || isOwner.value)
}

async function copyLink() {
  await navigator.clipboard.writeText(window.location.origin + `/orders/${orderId}`)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <p v-if="!order && !error" class="text-slate-500">Loading order...</p>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <div v-if="order" class="space-y-4">
    <!-- Header: stall, order code and status -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="page-title">{{ order.placeName }}</h1>
        <p class="text-slate-500">Order {{ orderCode(order.id) }} · pickup</p>
      </div>
      <span class="rounded-full bg-brand-light px-3 py-1 font-semibold text-brand" data-testid="order-status">
        {{ STATUS_LABELS[order.status] }}
      </span>
    </div>

    <p v-if="justPaid && order.status === 'awaiting_payment'" class="card text-sm">Confirming your payment with Stripe...</p>
    <p v-if="order.status === 'ready'" class="card font-semibold text-brand">Your food is ready! Show {{ orderCode(order.id) }} at the stall.</p>

    <div class="grid gap-4 md:grid-cols-2">
      <!-- Menu: only while the order is still a cart -->
      <section v-if="isCart" class="card">
        <h2 class="mb-2 font-bold">Menu</h2>
        <ul class="divide-y divide-slate-100">
          <li v-for="dish in menu" :key="dish.id" class="flex items-center justify-between py-2">
            <span>{{ dish.name }} <span class="text-slate-500">{{ formatMoney(dish.price) }}</span></span>
            <button class="btn text-sm" :disabled="busy" @click="add(dish)" :aria-label="`Add ${dish.name}`">Add</button>
          </li>
        </ul>
      </section>

      <!-- The cart -->
      <section class="card">
        <h2 class="mb-2 font-bold">Cart</h2>
        <p v-if="order.items.length === 0" class="text-slate-500">Nothing yet. Add something from the menu.</p>
        <ul class="divide-y divide-slate-100">
          <li v-for="item in order.items" :key="item.lineId" class="flex items-center justify-between gap-2 py-2" data-testid="cart-item">
            <div>
              <p>{{ item.qty }} × {{ item.name }}</p>
              <p class="text-xs text-slate-500">added by {{ item.addedByName }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-semibold">{{ formatMoney(item.price * item.qty) }}</span>
              <template v-if="canEdit(item)">
                <button class="btn px-3 text-sm" :disabled="busy" @click="minus(item)" aria-label="One less">−</button>
                <button class="btn px-3 text-sm" :disabled="busy" @click="plus(item)" aria-label="One more">+</button>
              </template>
            </div>
          </li>
        </ul>
        <p class="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold">
          <span>Total</span><span data-testid="order-total">{{ formatMoney(order.total) }}</span>
        </p>
      </section>
    </div>

    <!-- Split the bill -->
    <section v-if="order.items.length > 0" class="card">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-bold">Split the bill</h2>
        <div class="flex gap-2">
          <button class="btn text-sm" :class="{ 'btn-primary': splitMode === 'item' }" @click="splitMode = 'item'">By item</button>
          <button class="btn text-sm" :class="{ 'btn-primary': splitMode === 'equal' }" @click="splitMode = 'equal'">Equally</button>
        </div>
      </div>
      <ul>
        <li v-for="share in shares" :key="share.uid" class="flex justify-between py-1" data-testid="share">
          <span>{{ share.name }}<span v-if="share.uid === order.ownerUid" class="text-slate-500"> (pays)</span></span>
          <span class="font-semibold">{{ formatMoney(share.amount) }}</span>
        </li>
      </ul>
      <p class="mt-2 text-xs text-slate-500">One person pays the stall. Everyone else pays them back their share.</p>
    </section>

    <!-- Actions -->
    <section v-if="isCart || order.status === 'awaiting_payment'" class="card flex flex-wrap items-center gap-3">
      <button v-if="isCart" class="btn" @click="copyLink">{{ copied ? 'Link copied!' : 'Share cart link' }}</button>
      <template v-if="isOwner">
        <button class="btn-primary" :disabled="busy || order.items.length === 0" @click="pay">
          Pay {{ formatMoney(order.total) }}
        </button>
        <button class="btn-danger" :disabled="busy" @click="cancel">Cancel order</button>
      </template>
      <p v-else class="text-sm text-slate-500">Waiting for {{ order.members[0].name }} to pay.</p>
    </section>

    <RouterLink to="/orders" class="text-sm text-brand">← All my orders</RouterLink>
  </div>
</template>
