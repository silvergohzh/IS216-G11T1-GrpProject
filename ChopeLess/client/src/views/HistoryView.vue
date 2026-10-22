<!-- Meal History: where I've eaten, with stats. Owner: M3 -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { listHistory, deleteHistoryItem, clearHistory } from '../services/history'

const auth = useAuthStore()
const items = ref([])
const loading = ref(true)
const error = ref('')

async function load() {
  try { items.value = await listHistory(auth.user.uid) } catch (err) { error.value = err.message }
  loading.value = false
}
onMounted(load)

// The most common value in a list, e.g. my favourite place
function mostCommon(list) {
  const counts = {}
  list.forEach(x => { counts[x] = (counts[x] || 0) + 1 })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return top ? { value: top[0], count: top[1] } : null
}

const stats = computed(() => ({
  total: items.value.length,
  topPlace: mostCommon(items.value.map(h => h.placeName)),
  topCuisine: mostCommon(items.value.map(h => h.cuisine).filter(Boolean)),
  avgGroup: items.value.length
    ? (items.value.reduce((sum, h) => sum + h.groupSize, 0) / items.value.length).toFixed(1)
    : 0
}))

const formatDate = ms => new Date(ms).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

async function remove(code) {
  await deleteHistoryItem(auth.user.uid, code)
  items.value = items.value.filter(h => h.code !== code)
}
async function clearAll() {
  if (!confirm('Clear your whole Meal History?')) return
  await clearHistory(auth.user.uid)
  items.value = []
}
</script>

<template>
  <h1 class="page-title">Meal History</h1>
  <p class="mb-4 text-slate-600">Every place your groups picked.</p>
  <p v-if="error" class="error mb-3">{{ error }}</p>
  <p v-if="loading">Loading…</p>

  <template v-else>
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="card text-center"><b class="block text-2xl">{{ stats.total }}</b>sessions</div>
      <div class="card text-center"><b class="block truncate">{{ stats.topPlace?.value || '–' }}</b>favourite place</div>
      <div class="card text-center"><b class="block">{{ stats.topCuisine?.value || '–' }}</b>favourite cuisine</div>
      <div class="card text-center"><b class="block text-2xl">{{ stats.avgGroup }}</b>avg group size</div>
    </div>

    <div class="card">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="font-bold">Past sessions</h2>
        <button v-if="items.length" class="text-sm text-red-600" @click="clearAll">Clear all</button>
      </div>
      <p v-if="!items.length" class="text-slate-500">No sessions yet. Finish a Makan Session and it'll show up here.</p>
      <ul v-else class="divide-y divide-slate-100" data-testid="history-list">
        <li v-for="h in items" :key="h.code" class="flex items-center justify-between py-2">
          <span>
            <b>{{ h.placeName }}</b>
            <span class="text-sm text-slate-500"> · {{ h.cuisine }} · {{ h.groupSize }} people · {{ formatDate(h.at) }}</span>
          </span>
          <button class="text-sm text-slate-400 hover:text-red-600" aria-label="Delete" @click="remove(h.code)">✕</button>
        </li>
      </ul>
    </div>
  </template>
</template>