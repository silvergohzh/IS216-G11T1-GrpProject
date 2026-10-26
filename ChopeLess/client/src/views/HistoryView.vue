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
  <p class="kicker">Your adventure log</p>
  <h1 class="page-title">Meal History</h1>
  <p class="mb-4 text-slate-600">Every place your groups picked.</p>
  <p v-if="error" class="error mb-3">{{ error }}</p>
  <p v-if="loading">Loading…</p>

  <template v-else>
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="card card-navy text-center"><b class="block font-display text-4xl font-normal text-accent">{{ stats.total }}</b>sessions</div>
      <div class="card text-center"><b class="block truncate">{{ stats.topPlace?.value || '–' }}</b>favourite place</div>
      <div class="card text-center"><b class="block">{{ stats.topCuisine?.value || '–' }}</b>favourite cuisine</div>
            <div class="card text-center"><b class="block font-display text-4xl font-normal">{{ stats.avgGroup }}</b>avg group size</div>
    </div>

    <div class="card">
      <div class="mb-2 flex items-center justify-between">
        <h2>Past sessions</h2>
        <button v-if="items.length" class="btn text-sm" @click="clearAll">Clear all</button>
      </div>
      <p v-if="!items.length" class="text-slate-500">No sessions yet. Finish a Makan Session and it'll show up here.</p>
        <ul v-else class="flex flex-col gap-2" data-testid="history-list">
        <li v-for="(h, i) in items" :key="h.code" class="flex items-center gap-3 rounded-2xl border-[3px] border-ink bg-sky px-3 py-2">
          <!-- numbered tile, newest has the biggest number; colour cycles like the island stations -->
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-[3px] border-ink font-display text-lg"
                :style="{ background: ['#7bc96f', '#ffd23f', '#ff7a45', '#8fd3ff'][i % 4] }">{{ items.length - i }}</span>
          <span class="min-w-0 flex-1">
            <b class="block truncate">{{ h.placeName }}</b>
            <!-- only show the parts we have, so an empty cuisine doesn't leave "· ·" -->
            <span class="block text-sm font-bold">{{ [h.cuisine, `${h.groupSize} people`, formatDate(h.at)].filter(Boolean).join(' · ') }}</span>
          </span>
          <button class="btn h-11 w-11 !p-0" :aria-label="`Delete ${h.placeName}`" @click="remove(h.code)">✕</button>
        </li>
      </ul>
    </div>
  </template>
</template>