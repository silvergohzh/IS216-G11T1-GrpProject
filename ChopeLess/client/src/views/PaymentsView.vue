<!-- Payments: one page, it changes with your role. Owner: M6
     - Diner:  "My payments"   receipts for group orders you were in
     - Hawker: "Earnings"      payments to your stall and the total
     - Admin:  "All payments"  every payment, and deleting records -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchMyPayments, watchStallPayments, watchAllPayments, deletePayment } from '../services/payments'
import { orderCode } from '../services/orders'
import { formatMoney } from '../lib/splitBill'

const auth = useAuthStore()
const payments = ref([])
const error = ref('')
const busy = ref(false)
let stopWatching = null

const title = computed(() => {
  if (auth.isAdmin) return 'All payments'
  if (auth.isHawker) return 'Earnings'
  return 'My payments'
})

// Hawkers and admins see the total. Only admins can delete records.
const isStaff = computed(() => auth.isHawker || auth.isAdmin)

// Total money paid, in cents
const totalPaid = computed(() => {
  let total = 0
  for (const p of payments.value) {
    if (p.status === 'paid') total = total + p.amount
  }
  return total
})

onMounted(() => {
  // Live: a new payment shows up here the moment an order is paid
  const show = list => (payments.value = list)
  const fail = err => (error.value = err.message)
  if (auth.isAdmin) stopWatching = watchAllPayments(show, fail)
  else if (auth.isHawker) stopWatching = watchStallPayments(auth.user.placeId, show, fail)
  else stopWatching = watchMyPayments(auth.user.uid, show, fail)
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

const remove = payment => run(async () => {
  if (!confirm('Delete this payment record? This cannot be undone.')) return
  await deletePayment(payment.id)
})
</script>

<template>
  <p class="kicker">Payments</p>
  <h1 class="page-title">{{ title }}</h1>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <!-- Hawker / admin summary -->
  <section v-if="isStaff" class="card card-sun mb-4" data-testid="earnings-total">
    <p class="text-sm font-bold">Total paid</p>
    <p class="font-display text-4xl">{{ formatMoney(totalPaid) }}</p>
    <p class="text-sm">{{ payments.length }} payment(s)</p>
  </section>

  <p v-if="payments.length === 0" class="card text-slate-500">No payments yet.</p>
  <ul class="space-y-3">
    <li v-for="p in payments" :key="p.id" class="card space-y-2" data-testid="payment-row">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-bold">{{ p.placeName }} <span class="text-slate-400">{{ orderCode(p.orderId) }}</span></p>
          <p class="text-sm text-slate-500">
            Paid by {{ p.payerName }} · {{ p.method === 'stripe' ? 'Card (Stripe)' : 'Demo payment' }} · {{ new Date(p.paidAt).toLocaleString() }}
          </p>
        </div>
        <div class="text-right">
          <p class="font-display text-2xl" data-testid="payment-amount">{{ formatMoney(p.amount) }}</p>
          <span class="chip !text-xs !bg-[#7bc96f]" data-testid="payment-status">Paid</span>
        </div>
      </div>

      <!-- Delete (admin) -->
      <div v-if="isStaff" class="flex flex-wrap items-center gap-2">
        <button v-if="auth.isAdmin" class="btn text-sm text-red-700" :disabled="busy" @click="remove(p)">Delete record</button>
        <RouterLink :to="`/orders/${p.orderId}`" class="text-sm underline">View order</RouterLink>
      </div>
      <RouterLink v-else :to="`/orders/${p.orderId}`" class="text-sm underline">View order</RouterLink>
    </li>
  </ul>
</template>
