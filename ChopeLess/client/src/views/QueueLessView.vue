<!-- QueueLess list: wait and seat estimates for each place. Owner: M4 -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { listPlaces } from '../services/places'

const places = ref([])
const error = ref('')
const sortBy = ref('wait')

// Shortest wait first, or A to Z. Places with no estimate go last.
const sorted = computed(() => [...places.value].sort((a, b) =>
  sortBy.value === 'name' ? a.name.localeCompare(b.name) : (a.latest?.waitMins ?? 999) - (b.latest?.waitMins ?? 999)))

onMounted(async () => {
  try { places.value = await listPlaces() } catch (err) { error.value = err.message }
})

function level(p) {
  const occ = p.latest?.seatOccupancy ?? 0
  return occ >= 75 ? 'Packed' : occ >= 45 ? 'Busy' : 'Quiet'
}
const colours = { Quiet: 'bg-green-100 text-green-800', Busy: 'bg-amber-100 text-amber-800', Packed: 'bg-red-100 text-red-800' }
</script>

<template>
  <h1 class="page-title">QueueLess</h1>
  <p class="mb-4 text-slate-600">AI estimates of queue length and seats taken, from photos uploaded by other diners. Tap a place to add yours.</p>
  <p v-if="error" class="error">{{ error }}</p>
  <label class="mb-3 flex items-center gap-2 text-sm">
    Sort by
    <select v-model="sortBy" class="input w-auto py-1" data-testid="sort">
      <option value="wait">Shortest wait</option>
      <option value="name">Name</option>
    </select>
  </label>
  <ul class="grid gap-3 md:grid-cols-2">
    <li v-for="p in sorted" :key="p.id">
      <RouterLink :to="`/places/${p.id}`" class="card flex items-center justify-between hover:border-brand" data-testid="place-row">
        <div>
          <h2 class="font-bold">{{ p.name }}</h2>
          <p class="text-sm text-slate-500">~{{ p.latest?.waitMins ?? '?' }} min wait · {{ p.latest?.seatOccupancy ?? '?' }}% seats taken</p>
        </div>
        <span class="rounded-full px-3 py-1 text-xs font-bold" :class="colours[level(p)]">{{ level(p) }}</span>
      </RouterLink>
    </li>
  </ul>
</template>
