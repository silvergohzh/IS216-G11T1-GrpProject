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
// Quiet / Busy / Packed colours for the wait badge and the crowd meter
const badge = { Quiet: 'bg-green-200', Busy: 'bg-amber-200', Packed: 'bg-red-200' }
const bar = { Quiet: 'bg-green-600', Busy: 'bg-amber-400', Packed: 'bg-red-600' }
</script>

<template>
  <p class="kicker">Station 2 · Queue Tower</p>
  <h1 class="page-title">QueueLess</h1>
  <p class="mb-4">AI estimates of queue length and seats taken, from photos uploaded by other diners. Tap a place to add yours.</p>
  <p v-if="error" class="error">{{ error }}</p>

  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <p class="rounded-2xl border-[3px] border-ink bg-accent px-4 py-2 font-black">
      Standing in a queue? Open the place and snap it: everyone gets a better estimate.
    </p>
    <label class="flex items-center gap-2 font-black">
      Sort
      <select v-model="sortBy" class="input w-auto py-1" data-testid="sort">
        <option value="wait">Shortest wait</option>
        <option value="name">Name</option>
      </select>
    </label>
  </div>

  <ul class="flex flex-col gap-3">
    <li v-for="p in sorted" :key="p.id">
      <RouterLink :to="`/places/${p.id}`" data-testid="place-row"
                  class="flex flex-wrap items-center gap-4 rounded-3xl border-4 border-ink bg-white px-4 py-3 transition hover:translate-x-1">
        <!-- big wait number, coloured by crowd level -->
        <span class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-[3px] border-ink font-display text-2xl leading-none"
              :class="badge[level(p)]">{{ p.latest?.waitMins ?? '?' }}<small class="-mt-2 font-sans text-[11px] font-black">min</small></span>
        <div class="min-w-0 flex-[1_1_200px]">
          <h2 class="font-sans text-lg font-black">{{ p.name }}</h2>
          <p class="text-sm font-bold">{{ p.latest?.seatOccupancy ?? '?' }}% seats taken</p>
        </div>
        <!-- crowd meter: the word says it too, so it doesn't rely on colour -->
        <div class="flex w-48 flex-col gap-1">
          <span class="text-sm font-black">{{ level(p) }}</span>
          <span class="h-3 overflow-hidden rounded-full border-2 border-ink bg-sky">
            <span class="block h-full" :class="bar[level(p)]" :style="{ width: (p.latest?.seatOccupancy ?? 0) + '%' }"></span>
          </span>
        </div>
      </RouterLink>
    </li>
  </ul>
</template>
