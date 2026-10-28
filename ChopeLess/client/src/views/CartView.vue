<!-- One order: group cart, split bill, payment, pickup (timer, location, photo proof). Owner: M6
     Diners in the order, the stall's hawker and admins can all open this page.
     Buttons only show for the people allowed to use them. -->
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import {
  watchOrder, watchProofs, getStall, addItem, changeQty, removeItem,
  cancelOrder, checkout, markCollected, orderCode, STATUS_LABELS,
  // [NAWAZ] Fastpass imports (next line)
  buyFastpass, getQueuePosition, getMyPoints
} from '../services/orders'
import { splitByItem, splitEqually, formatMoney } from '../lib/splitBill'
import { askNotificationPermission } from '../lib/notify'
import MapView from '../components/MapView.vue'
import PickupTimer from '../components/PickupTimer.vue'
import ProofUpload from '../components/ProofUpload.vue'

const route = useRoute()
const auth = useAuthStore()
const orderId = route.params.id

const order = ref(null)
const stall = ref(null)              // { name, address, lat, lng, menu }
const proofs = ref({})               // { ready: { photo, byName, at }, collected: {...} }
const error = ref('')
const busy = ref(false)              // true while a button is waiting for the server
const splitMode = ref('item')        // 'item' or 'equal'
const copied = ref(false)
const linkBox = ref(null)            // the text box with the share link
let stopOrder = null
let stopProofs = null

// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
// [NAWAZ] TODO: FASTPASS_COST is typed in twice (here and the server); return it from the server instead
// ---------- Fastpass ----------
// The group leader can spend Makan Points so the hawker prepares this order first.
// (The server checks everything again: who you are, your points, and the order's status.)
const FASTPASS_COST = 150
const myPoints = ref(null)           // my Makan Points balance (only loaded for the group leader)
const queue = ref(null)              // { position, waiting } once the order is paid
// [NAWAZ] END

// Handy true/false values for the template
const isMember = computed(() => order.value && order.value.memberUids.includes(auth.user.uid))
const isOwner = computed(() => order.value && order.value.ownerUid === auth.user.uid)
const isCart = computed(() => order.value && order.value.status === 'cart')
// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
const canBuyFastpass = computed(() =>
  isOwner.value && !order.value.priority && ['cart', 'awaiting_payment', 'paid'].includes(order.value.status)
)
// [NAWAZ] END
const justPaid = route.query.paid === '1' // Stripe sends people back here with ?paid=1

// The link friends open to join, e.g. http://localhost:5173/orders?join=KQWTRM
const shareLink = computed(() => order.value ? `${window.location.origin}/orders?join=${order.value.joinCode}` : '')

// Google Maps directions to the stall
const directionsLink = computed(() =>
  stall.value ? `https://www.google.com/maps/dir/?api=1&destination=${stall.value.lat},${stall.value.lng}` : ''
)

// Who owes what. Recalculated automatically whenever the cart or the split mode changes.
const shares = computed(() => {
  if (!order.value) return []
  if (splitMode.value === 'equal') return splitEqually(order.value.items, order.value.members)
  return splitByItem(order.value.items, order.value.members)
})

onMounted(() => {
  // Live updates: everyone sees new items and status changes instantly
  stopOrder = watchOrder(orderId, async data => {
    order.value = data
    if (data && !stall.value) stall.value = await getStall(data.placeId)
  }, err => (error.value = 'You cannot see this order. Ask the person who started it for the join code.'))

  stopProofs = watchProofs(orderId, data => (proofs.value = data), () => {})
})

// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
// When the order changes: load my points (group leader), and my place in the queue (once paid)
watch(order, async now => {
  if (!now) return
  if (now.ownerUid === auth.user.uid && myPoints.value === null) {
    const account = await getMyPoints()
    myPoints.value = account.balance
  }
  if (now.status === 'paid' && now.memberUids.includes(auth.user.uid)) {
    queue.value = await getQueuePosition(orderId)
  } else {
    queue.value = null
  }
})
// [NAWAZ] END
onUnmounted(() => {
  if (stopOrder) stopOrder()
  if (stopProofs) stopProofs()
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
const collect = photo => run(() => markCollected(orderId, photo))

// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
// Spend points on a Fastpass, then show my new balance
const fastpass = () => run(async () => {
  await buyFastpass(orderId)
  const account = await getMyPoints()
  myPoints.value = account.balance
})
// [NAWAZ] END

// Pay: Stripe's payment page opens in a NEW TAB, and this page stays open.
// When Stripe confirms the payment (webhook), this page turns "Paid" by itself.
// (In demo mode there is no Stripe page: the order is paid straight away.)
const payingInOtherTab = ref(false)
const pay = () => run(async () => {
  askNotificationPermission() // so we can tell you when your food is ready

  // Open the new tab straight away, while the click is still happening.
  // Browsers block tabs that open later (after waiting for the server).
  const stripeTab = window.open('', '_blank')
  try {
    const result = await checkout(orderId)
    if (result.url && stripeTab) {
      stripeTab.location.href = result.url     // show Stripe in the new tab
      payingInOtherTab.value = true
    } else if (result.url) {
      window.location.href = result.url        // the browser blocked the new tab: use this one
    } else if (stripeTab) {
      stripeTab.close()                        // demo mode: already paid, no Stripe page needed
    }
  } catch (err) {
    if (stripeTab) stripeTab.close()
    throw err
  }
})

// You can only change items you added (the owner can change everything)
function canEdit(item) {
  return isCart.value && (item.addedBy === auth.user.uid || isOwner.value)
}

// Copy the share link. Some browsers block copying, so we fall back to selecting the text.
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
  } catch {
    linkBox.value.select()
    document.execCommand('copy')
  }
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
        <p class="kicker">Station 5 · Tingkat Pier</p>
        <h1 class="page-title">{{ order.placeName }}</h1>
        <p class="text-slate-500">Order {{ orderCode(order.id) }} · pickup</p>
      </div>
      <span class="chip !bg-accent !text-base" data-testid="order-status">
        {{ STATUS_LABELS[order.status] }}
      </span>
    </div>

    <p v-if="justPaid && order.status === 'awaiting_payment'" class="card text-sm">Confirming your payment with Stripe...</p>
    <p v-if="justPaid && order.status === 'paid'" class="card text-sm font-semibold text-brand">Payment done! You can close this tab.</p>
    <p v-if="payingInOtherTab && order.status === 'awaiting_payment'" class="card text-sm" data-testid="paying-notice">
      Finish paying in the Stripe tab. This page will change to "Paid" by itself.
    </p>

    <!-- [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md) -->
    <!-- Fastpass: everyone in the group order sees it once it's on -->
    <section v-if="order.priority" class="card card-sun" data-testid="fastpass-on">
      <p class="font-bold">⚡ Fastpass on</p>
      <p class="text-sm">{{ order.priorityBy }} used Makan Points, so the hawker prepares this group order first.</p>
    </section>
    <section v-else-if="canBuyFastpass" class="card space-y-2" data-testid="fastpass-offer">
      <p class="font-bold">⚡ Skip the queue with a Fastpass</p>
      <p class="text-sm">Use {{ FASTPASS_COST }} Makan Points and the hawker prepares your order first. Everyone in this group order gets it.</p>
      <p class="text-sm">You have <b>{{ myPoints ?? '...' }}</b> points.</p>
      <button class="btn-primary" :disabled="busy || myPoints === null || myPoints < FASTPASS_COST" @click="fastpass">
        {{ myPoints !== null && myPoints < FASTPASS_COST ? 'Not enough points' : `Use ${FASTPASS_COST} points` }}
      </button>
    </section>

    <!-- Place in the queue (Janani's priority queue: Fastpass first, then first come first served) -->
    <p v-if="queue && queue.position > 0" class="card font-semibold" data-testid="queue-position">
      You're #{{ queue.position }} of {{ queue.waiting }} in the queue at this stall.
    </p>
    <!-- [NAWAZ] END -->

    <!-- Ready: countdown, and the diner collects it with a photo -->
    <section v-if="order.status === 'ready'" class="card card-sun space-y-3">
      <p class="font-display text-2xl">Your food is ready! Show {{ orderCode(order.id) }} at the stall.</p>
      <PickupTimer :pickup-by="order.pickupBy" />
      <div v-if="isMember">
        <p class="mb-2 text-sm text-slate-600">Picked it up? Take a photo of your food, then tap the button.</p>
        <ProofUpload button-text="I've collected it" :busy="busy" @send="collect" />
      </div>
      <p v-else class="text-sm text-slate-600">Waiting for the diner to collect it.</p>
    </section>

    <p v-if="order.status === 'collected'" class="card font-semibold text-brand">
      Collected by {{ order.collectedByName }} at {{ new Date(order.collectedAt).toLocaleTimeString() }}.
    </p>

    <!-- Share with friends: only while it's still a cart -->
    <section v-if="isCart && isMember" class="card card-navy space-y-2">
      <h2>Order as a group</h2>
      <p class="text-sm font-bold">Friends can enter this code on the Pre-order page, or open the link.</p>
      <p class="font-display text-5xl tracking-[0.2em] text-accent" data-testid="join-code">{{ order.joinCode }}</p>
      <div class="flex gap-2">
        <input ref="linkBox" :value="shareLink" readonly class="input text-sm text-ink" aria-label="Share link" @focus="$event.target.select()" />
        <button class="btn shrink-0" @click="copyLink">{{ copied ? 'Copied!' : 'Copy link' }}</button>
      </div>
    </section>

    <div class="grid gap-4 md:grid-cols-2">
      <!-- Menu: only while the order is still a cart -->
      <section v-if="isCart && isMember" class="card">
        <h2 class="mb-2">Menu</h2>
        <p v-if="!stall" class="text-slate-500">Loading menu...</p>
        <p v-else-if="stall.menu.length === 0" class="text-slate-500">This stall has no menu yet.</p>
        <ul class="divide-y divide-slate-100">
          <li v-for="dish in stall?.menu || []" :key="dish.id" class="flex items-center justify-between py-2">
            <span :class="{ 'text-slate-400 line-through': dish.available === false }">{{ dish.name }} <span class="text-slate-500">{{ formatMoney(dish.price) }}</span></span>
            <span v-if="dish.available === false" class="text-sm font-bold text-red-600">Sold out</span>
            <button v-else class="btn text-sm" :disabled="busy" @click="add(dish)" :aria-label="`Add ${dish.name}`">Add</button>
          </li>
        </ul>
      </section>

      <!-- The cart -->
      <section class="card">
        <h2 class="mb-2">{{ isCart ? 'Cart' : 'Order' }}</h2>
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
        <p class="mt-3 flex justify-between border-t-[3px] border-dashed border-ink pt-3 font-display text-2xl">
          <span>Total</span><span data-testid="order-total">{{ formatMoney(order.total) }}</span>
        </p>
      </section>
    </div>

    <!-- Split the bill -->
    <section v-if="order.items.length > 0" class="card">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2>Split the bill</h2>
        <div class="flex gap-2">
          <button class="btn text-sm" :class="{ '!bg-ink !text-white': splitMode === 'item' }" @click="splitMode = 'item'">By item</button>
          <button class="btn text-sm" :class="{ '!bg-ink !text-white': splitMode === 'equal' }" @click="splitMode = 'equal'">Equally</button>
        </div>
      </div>
      <ul>
        <li v-for="share in shares" :key="share.uid" class="stat mb-2 flex justify-between !text-left" data-testid="share">
          <span>{{ share.name }}<span v-if="share.uid === order.ownerUid" class="text-slate-500"> (pays)</span></span>
          <span class="font-semibold">{{ formatMoney(share.amount) }}</span>
        </li>
      </ul>
      <p class="mt-2 text-xs text-slate-500">One person pays the stall. Everyone else pays them back their share.</p>
    </section>

    <!-- Pay / cancel -->
    <section v-if="isMember && (isCart || order.status === 'awaiting_payment')" class="card flex flex-wrap items-center gap-3">
      <template v-if="isOwner">
        <button class="btn-primary min-h-14 font-display text-2xl font-normal" :disabled="busy || order.items.length === 0" @click="pay">
          Pay {{ formatMoney(order.total) }}
        </button>
        <button class="btn-danger" :disabled="busy" @click="cancel">Cancel order</button>
      </template>
      <p v-else class="text-sm text-slate-500">Waiting for {{ order.members[0].name }} to pay.</p>
    </section>

    <!-- Where to pick it up -->
    <section v-if="stall" class="card space-y-2">
      <h2>Pickup location</h2>
      <p>{{ stall.name }}<br /><span class="text-sm text-slate-500">{{ stall.address }}</span></p>
      <MapView :center="[stall.lat, stall.lng]" :markers="[{ lat: stall.lat, lng: stall.lng, label: stall.name }]" />
      <a :href="directionsLink" target="_blank" rel="noopener" class="btn inline-block text-sm">Get directions</a>
    </section>

    <!-- Photo proof -->
    <section v-if="proofs.ready || proofs.collected" class="card">
      <h2 class="mb-2">Photo proof</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <figure v-if="proofs.ready">
          <img :src="proofs.ready.photo" alt="Food when it was ready" class="h-48 w-full rounded-lg object-cover" data-testid="proof-photo" />
          <figcaption class="mt-1 text-xs text-slate-500">Ready · {{ proofs.ready.byName }} · {{ new Date(proofs.ready.at).toLocaleTimeString() }}</figcaption>
        </figure>
        <figure v-if="proofs.collected">
          <img :src="proofs.collected.photo" alt="Food when it was collected" class="h-48 w-full rounded-lg object-cover" data-testid="proof-photo" />
          <figcaption class="mt-1 text-xs text-slate-500">Collected · {{ proofs.collected.byName }} · {{ new Date(proofs.collected.at).toLocaleTimeString() }}</figcaption>
        </figure>
      </div>
    </section>

    <RouterLink :to="auth.isHawker ? '/hawker' : '/orders'" class="btn text-sm">← Back</RouterLink>
  </div>
</template>
