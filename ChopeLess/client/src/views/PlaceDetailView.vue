<!-- One place: latest estimate, hourly trend and "analyse a photo". Owner: M4 -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getPlace, analysePhoto, shrinkPhoto } from '../services/places'

const route = useRoute()
const place = ref(null)
const photo = ref('')      // the shrunk photo as a data URL, used for the preview and the upload
const result = ref(null)
const loading = ref(false)
const error = ref('')

async function load() {
  try { place.value = await getPlace(route.params.id) } catch (err) { error.value = err.message }
}
onMounted(load)

async function choosePhoto(e) {
  const file = e.target.files[0]
  result.value = null
  error.value = ''
  if (!file) return (photo.value = '')
  try { photo.value = await shrinkPhoto(file) } catch (err) { error.value = err.message }
}

// Send the photo to our server, which asks OpenAI and saves the estimate
async function analyse() {
  loading.value = true
  error.value = ''
  try {
    result.value = await analysePhoto(route.params.id, photo.value)
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const confidenceColours = { high: 'bg-green-100 text-green-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-200 text-slate-700' }

// How long ago the latest estimate was made, e.g. "5 min ago"
function ago(iso) {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}

// "Best time to go": the hour with the shortest average wait
const bestHour = computed(() => {
  const trend = place.value?.trend || []
  return trend.length ? trend.reduce((best, t) => (t.avgWait < best.avgWait ? t : best)) : null
})
const maxWait = computed(() => Math.max(1, ...(place.value?.trend || []).map(t => t.avgWait)))
const hourLabel = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
</script>

<template>
  <div v-if="place" class="space-y-4">
    <div>
      <RouterLink to="/queueless" class="text-sm text-brand">← All places</RouterLink>
      <h1 class="page-title">{{ place.name }}</h1>
      <p class="text-slate-600">{{ place.address }}</p>
    </div>

    <div class="card" data-testid="latest">
      <h2 class="mb-2 font-bold">Right now</h2>
      <div v-if="place.latest" class="grid grid-cols-3 gap-2 text-center">
        <div><p class="text-2xl font-extrabold">~{{ place.latest.waitMins }}</p><p class="text-xs text-slate-500">min wait</p></div>
        <div><p class="text-2xl font-extrabold">{{ place.latest.seatOccupancy }}%</p><p class="text-xs text-slate-500">seats taken</p></div>
        <div><p class="text-2xl font-extrabold">{{ place.latest.peopleInQueue }}</p><p class="text-xs text-slate-500">in queue</p></div>
      </div>
      <p v-else class="text-slate-500">No estimate yet. Upload a photo below.</p>
      <p v-if="place.latest" class="mt-2 text-xs text-slate-500">
        Updated {{ ago(place.latest.at) }} ·
        <span class="rounded-full px-2 py-0.5 font-bold" :class="confidenceColours[place.latest.confidence]">{{ place.latest.confidence }} confidence</span>
      </p>
    </div>

    <div class="card">
      <h2 class="mb-1 font-bold">Average wait by hour</h2>
      <p v-if="bestHour" class="mb-3 text-sm text-slate-600" data-testid="best-time">
        Best time to go: <strong>{{ hourLabel(bestHour.hour) }}</strong> (about {{ Math.round(bestHour.avgWait) }} min)
      </p>
      <!-- Simple CSS bar chart -->
      <div class="flex h-40 items-end gap-1 overflow-x-auto">
        <div v-for="t in place.trend" :key="t.hour" class="flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1">
          <div class="w-full rounded-t" :class="t.hour === bestHour?.hour ? 'bg-accent' : 'bg-brand'"
            :style="{ height: Math.max(4, (t.avgWait / maxWait) * 100) + '%' }" :title="Math.round(t.avgWait) + ' min'"></div>
          <span class="text-[10px] text-slate-500">{{ t.hour }}</span>
        </div>
      </div>
    </div>

    <div class="card space-y-3">
      <h2 class="font-bold">Update with a photo</h2>
      <p class="text-sm text-slate-600">Snap the queue and seating area. AI estimates how busy it is and everyone sees the update.</p>
      <input type="file" accept="image/*" @change="choosePhoto" data-testid="photo-input" />
      <img v-if="photo" :src="photo" alt="Your photo" class="max-h-64 rounded-lg" />
      <button class="btn-primary" :disabled="!photo || loading" @click="analyse" data-testid="analyse-btn">
        {{ loading ? 'Analysing…' : 'Analyse photo' }}
      </button>
      <p v-if="result" class="rounded-lg bg-brand-light px-3 py-2 text-sm" data-testid="analysis-result">
        Thanks! We estimate {{ result.peopleInQueue }} people in the queue, about {{ result.waitMins }} min wait,
        and {{ result.seatOccupancy }}% of seats taken ({{ result.confidence }} confidence).
      </p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
  <p v-else-if="error" class="error">{{ error }}</p>
  <p v-else>Loading…</p>
</template>
