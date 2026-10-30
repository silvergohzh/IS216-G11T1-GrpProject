<!-- Public stall page: menu, location and a pre-order button. Owner: M6
     Anyone can open it, even without logging in, so a hawker can share the link like their own website. -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { watchStall } from '../services/hawkers'
import { createOrder } from '../services/orders'
import { formatMoney } from '../lib/splitBill'
import MapView from '../components/MapView.vue'
import PlaceTag from '../components/PlaceTag.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const stallId = route.params.id

const stall = ref(null)
const loading = ref(true)
const error = ref('')
let stopWatching = null

const isMyStall = computed(() => auth.isHawker && auth.user.placeId === stallId)
const directionsLink = computed(() =>
  stall.value ? `https://www.google.com/maps/dir/?api=1&destination=${stall.value.lat},${stall.value.lng}` : ''
)

onMounted(() => {
  // Live: if the hawker changes a price or marks something sold out, this page updates by itself
  stopWatching = watchStall(stallId, data => {
    stall.value = data
    loading.value = false
  }, err => {
    error.value = err.message
    loading.value = false
  })
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

// Logged in: start (or reopen) a pre-order here. Logged out: log in first, then come back.
async function preOrder() {
  if (!auth.isLoggedIn) return router.push({ name: 'login', query: { next: route.fullPath } })
  try {
    const { id } = await createOrder(stallId)
    router.push(`/orders/${id}`)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <p v-if="loading" class="text-slate-500">Loading...</p>
  <p v-else-if="!stall" class="card">This stall doesn't exist.</p>

  <div v-else class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="kicker">Stall</p>
        <!-- [SILVER] tag here and the Inside line below -->
        <PlaceTag :type="stall.type" />
        <h1 class="page-title">{{ stall.name }}</h1>
        <p class="text-slate-600">{{ stall.cuisine }} · {{ stall.address }}</p>
        <p v-if="stall.parentName" class="text-sm font-bold">Inside {{ stall.parentName }}</p>
        <p class="mt-1 flex flex-wrap gap-1">
          <span v-for="d in stall.dietary" :key="d" class="chip !bg-brand-light !text-brand">{{ d }}</span>
          <span v-for="m in stall.serviceModes" :key="m" class="chip">{{ m }}</span>
        </p>
        <!-- [SILVER] diet and service tags use the Makan Quest chip style -->
      </div>
      <RouterLink v-if="isMyStall" to="/hawker/menu" class="btn">Edit my menu</RouterLink>
      <button v-else-if="stall.menu.length > 0" class="btn-primary" @click="preOrder">Pre-order for pickup</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="grid gap-4 md:grid-cols-2">
      <section class="card">
        <h2 class="mb-2 font-bold">Menu</h2>
        <p v-if="stall.menu.length === 0" class="text-slate-500">No menu yet. Check back soon!</p>
        <ul class="divide-y divide-slate-100">
          <li v-for="dish in stall.menu" :key="dish.id" class="flex items-center justify-between py-2" data-testid="public-dish">
            <span :class="{ 'text-slate-400 line-through': dish.available === false || dish.stock === 0 }">
              {{ dish.name }}
              <span v-if="dish.stock > 0" class="block text-xs text-slate-500">{{ dish.stock }} left</span>
            </span>
            <span v-if="dish.available === false || dish.stock === 0" class="text-sm font-bold text-red-600">Sold out</span>
            <span v-else class="font-semibold">{{ formatMoney(dish.price) }}</span>
          </li>
        </ul>
      </section>

      <section class="card space-y-2">
        <h2 class="font-bold">Find us</h2>
        <MapView :center="[stall.lat, stall.lng]" :markers="[{ lat: stall.lat, lng: stall.lng, label: stall.name }]" />
        <a :href="directionsLink" target="_blank" rel="noopener" class="btn inline-block text-sm">Get directions</a>
      </section>
    </div>
  </div>
</template>
