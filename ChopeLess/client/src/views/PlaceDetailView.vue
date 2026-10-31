<!-- One place: latest estimate, hourly trend and "analyse a photo". Owner: M4 -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPlace, analysePhoto, shrinkPhoto, checkLiveQueue, livePhotoUrl } from '../services/places'

const route = useRoute()
const router = useRouter()

// One smart Back: return to the page you came from; if you opened this link directly, go to All places
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/queueless')
}
const place = ref(null)
const photoName = ref('') // name of the chosen file, shown on the button
const photo = ref('')      // the shrunk photo as a data URL, used for the preview and the upload
const result = ref(null)
const loading = ref(false)
const error = ref('')

async function load() {
  try { place.value = await getPlace(route.params.id) } catch (err) { error.value = err.message }
}
onMounted(load)


// Shrink the photo and show a preview. If it fails, show an error message
async function choosePhoto(e) {
  const file = e.target.files[0]
  photoName.value = file?.name || ''
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
  } finally { // always run, even if the try block throws an error
    loading.value = false
  }
}

// See Live Queue: the server analyses a photo from the place, then we reload to show it
const liveLoading = ref(false)
const liveError = ref('')
async function seeLive() {
  liveLoading.value = true
  liveError.value = ''
  try {
    await checkLiveQueue(route.params.id)
    await load()
  } catch (err) {
    liveError.value = err.message
  } finally {
    liveLoading.value = false
  }
}

// Colours for the confidence badge
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

// The current hour's bar is coloured by how busy it is right now (same levels as the QueueLess list)
const currentHour = Number(new Date().toLocaleString('en-SG', { hour: 'numeric', hour12: false, timeZone: 'Asia/Singapore' })) % 24

// "Right now" uses the current hour's average so it matches the chart; outside the chart's hours, the latest photo estimate
const nowStats = computed(() => {
  const t = place.value?.trend.find(t => t.hour === currentHour)
  if (!t) return place.value?.latest || null
  return { waitMins: Math.round(t.avgWait), seatOccupancy: Math.round(t.avgSeats), peopleInQueue: Math.round(t.avgPeople), reports: t.reports }
})
const nowColour = computed(() => {
  const occ = nowStats.value?.seatOccupancy ?? 0
  return occ >= 75 ? 'bg-red-500' : occ >= 45 ? 'bg-amber-400' : 'bg-green-500'
})

// The bar the user tapped (starts on the current hour); tap it again to close
const selectedHour = ref(currentHour)
const selected = computed(() => place.value?.trend.find(t => t.hour === selectedHour.value))
const toggleHour = h => (selectedHour.value = selectedHour.value === h ? null : h)
</script>

<template>
  <div v-if="place" class="space-y-4">
    <div>
      <button class="text-sm font-semibold text-brand hover:underline" @click="goBack">← Back</button>
      <h1 class="page-title">{{ place.name }}</h1>
      <p class="text-slate-600">{{ place.address }}</p>
    </div>

    <div class="card" data-testid="latest">
      <h2 class="mb-2 font-bold">Right now</h2>
      <div v-if="nowStats" class="grid grid-cols-3 gap-2 text-center">
        <div><p class="text-2xl font-extrabold">~{{ nowStats.waitMins }}</p><p class="text-xs text-slate-500">min wait</p></div>
        <div><p class="text-2xl font-extrabold">{{ nowStats.seatOccupancy }}%</p><p class="text-xs text-slate-500">seats taken</p></div>
        <div><p class="text-2xl font-extrabold">{{ nowStats.peopleInQueue }}</p><p class="text-xs text-slate-500">in queue</p></div>
      </div>
      <p v-else class="text-slate-500">No estimate yet. Upload a photo below.</p>
      <p v-if="place.latest" class="mt-2 text-xs text-slate-500">
        <span v-if="nowStats?.reports">Average of {{ nowStats.reports }} report{{ nowStats.reports === 1 ? '' : 's' }} this hour · </span>
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
        <button v-for="t in place.trend" :key="t.hour" type="button" @click="toggleHour(t.hour)" :aria-pressed="t.hour === selectedHour"
          :aria-label="`${hourLabel(t.hour)}: about ${Math.round(t.avgWait)} min wait`"
          class="flex h-full min-w-6 flex-1 cursor-pointer flex-col items-center justify-end gap-1 rounded hover:bg-slate-100"
          :class="t.hour === selectedHour && 'bg-slate-100'" data-testid="hour-bar">
          <div class="w-full rounded-t" :class="t.hour === currentHour ? [nowColour, 'ring-2 ring-ink ring-offset-1'] : 'bg-blue-700'"
            :style="{ height: Math.max(4, (t.avgWait / maxWait) * 100) + '%' }" :title="Math.round(t.avgWait) + ' min'"></div>
          <span v-if="t.hour === currentHour" class="text-[10px] font-bold text-ink" data-testid="now-label">Now</span>
          <span v-else class="text-[10px] text-slate-500">{{ t.hour }}</span>
        </button>
      </div>
      <div v-if="selected" class="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center" data-testid="hour-stats">
        <p class="col-span-3 text-left text-sm font-bold">{{ hourLabel(selected.hour) }} to {{ hourLabel((selected.hour + 1) % 24) }}</p>
        <div><p class="text-xl font-extrabold">~{{ Math.round(selected.avgWait) }}</p><p class="text-xs text-slate-500">min wait</p></div>
        <div><p class="text-xl font-extrabold">{{ Math.round(selected.avgSeats) }}%</p><p class="text-xs text-slate-500">seats taken</p></div>
        <div><p class="text-xl font-extrabold">{{ Math.round(selected.avgPeople) }}</p><p class="text-xs text-slate-500">in queue</p></div>
        <p class="col-span-3 text-left text-xs text-slate-500">Average of {{ selected.reports }} report{{ selected.reports === 1 ? '' : 's' }}</p>
      </div>
    </div>

    <div class="card space-y-3">
      <h2 class="font-bold">See Live Queue</h2>
      <p class="text-sm text-slate-600">Get the latest photo from the food court. AI reads it and updates the numbers above.</p>
      <img v-if="place.latest?.photo" :src="livePhotoUrl(place.latest.photo)" alt="Live photo of the queue" class="max-h-64 rounded-lg" data-testid="live-photo" />
      <button class="btn-primary" :disabled="liveLoading" @click="seeLive" data-testid="live-btn">
        {{ liveLoading ? 'Checking…' : 'See Live Queue' }}
      </button>
      <p v-if="liveError" class="error">{{ liveError }}</p>
    </div>

    <div class="card space-y-3">
      <h2 class="font-bold">Update with a photo</h2>
      <p class="text-sm text-slate-600">Snap the queue and seating area. AI estimates how busy it is and everyone sees the update.</p>
      <!-- The real file input is hidden; the label is the big, clear button people tap -->
      <label class="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-brand bg-brand-light/40 px-4 py-6 text-center hover:bg-brand-light focus-within:ring-2 focus-within:ring-brand">
        <span class="text-3xl" aria-hidden="true">📷</span>
        <span class="font-bold text-brand">{{ photo ? 'Change photo' : 'Take or choose a photo' }}</span>
        <span class="text-xs text-slate-500">{{ photoName || 'JPG, PNG or WebP from your camera or gallery' }}</span>
        <input type="file" accept="image/*" class="sr-only" @change="choosePhoto" data-testid="photo-input" />
      </label>
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
