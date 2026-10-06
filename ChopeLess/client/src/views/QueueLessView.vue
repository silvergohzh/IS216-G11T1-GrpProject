<!-- QueueLess list: wait and seat estimates for each place. Owner: M4 -->
<script setup>
import { ref, onMounted } from 'vue'
import { listPlaces } from '../services/places'

const places = ref([])
const error = ref('')

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
  <p class="mb-4 text-slate-600">AI estimates of queue length and seats taken right now.</p>
  <p v-if="error" class="error">{{ error }}</p>
  <ul class="grid gap-3 md:grid-cols-2">
    <li v-for="p in places" :key="p.id">
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
