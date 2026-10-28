<!-- One place: latest estimate, hourly trend and "analyse a photo". Owner: M4 -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPlace, analysePhoto, shrinkPhoto } from '../services/places'
// [M3] Today's Quests: remember that I checked a queue with a photo today
import { auth } from '../lib/firebase'
import { markQuest } from '../lib/quests'

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
        markQuest(auth.currentUser?.uid, 'queue-photo')   // [M3] ticks "Check a queue with a photo"
    await load()
  } catch (err) {
    error.value = err.message
  } finally { // always run, even if the try block throws an error
    loading.value = false
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
</script>

<template>
  <div v-if="place" class="space-y-4">
    <div>
      <button class="btn mb-2 text-sm" @click="goBack">← Back</button>
      <p class="kicker">Station 2 · Queue Tower</p>
      <h1 class="page-title">{{ place.name }}</h1>
      <p class="text-slate-600">{{ place.address }}</p>
    </div>

      <div class="card card-navy" data-testid="latest">
      <h2 class="mb-2">Right now</h2>
      <div v-if="place.latest" class="grid grid-cols-3 gap-2 text-center">
                <div><p class="font-display text-4xl text-accent">~{{ place.latest.waitMins }}</p><p class="text-xs font-bold">min wait</p></div>
        <div><p class="font-display text-4xl">{{ place.latest.seatOccupancy }}%</p><p class="text-xs font-bold">seats taken</p></div>
        <div><p class="font-display text-4xl">{{ place.latest.peopleInQueue }}</p><p class="text-xs font-bold">in queue</p></div>
      </div>
      <p v-else class="font-bold">No estimate yet. Upload a photo below.</p>
      <p v-if="place.latest" class="mt-2 text-xs font-bold">
        Updated {{ ago(place.latest.at) }} ·
        <span class="rounded-full px-2 py-0.5 font-bold" :class="confidenceColours[place.latest.confidence]">{{ place.latest.confidence }} confidence</span>
      </p>
    </div>

    <div class="card">
      <h2 class="mb-1">Average wait by hour</h2>
      <p v-if="bestHour" class="chip mb-3 !bg-green-200 !text-sm" data-testid="best-time">
        Best time to go: <strong>{{ hourLabel(bestHour.hour) }}</strong> (about {{ Math.round(bestHour.avgWait) }} min)
      </p>
      <!-- Simple CSS bar chart -->
        <div class="flex h-44 items-end gap-1.5 overflow-x-auto border-b-[3px] border-ink">
        <div v-for="t in place.trend" :key="t.hour" class="flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1">
          <div class="w-full rounded-t-lg border-[3px] border-b-0 border-ink" :class="t.hour === bestHour?.hour ? 'bg-[#7bc96f]' : t.avgWait > 20 ? 'bg-coral' : 'bg-accent'"
            :style="{ height: Math.max(4, (t.avgWait / maxWait) * 100) + '%' }" :title="Math.round(t.avgWait) + ' min'"></div>
           <span class="text-[11px] font-black">{{ t.hour }}</span>
        </div>
      </div>
    </div>

      <div class="card card-sun space-y-3">
      <h2>Snap the queue</h2>
      <p class="text-sm font-bold">Snap the queue and seating area. AI estimates how busy it is and everyone sees the update.</p>
      <!-- The real file input is hidden; the label is the big, clear button people tap -->
           <label class="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-[3px] border-dashed border-ink bg-white/70 px-4 py-6 text-center hover:bg-white focus-within:ring-4 focus-within:ring-coral">
        <span class="text-3xl" aria-hidden="true">📷</span>
        <span class="font-black">{{ photo ? 'Change photo' : 'Take or choose a photo' }}</span>
        <span class="text-xs text-slate-500">{{ photoName || 'JPG, PNG or WebP from your camera or gallery' }}</span>
        <input type="file" accept="image/*" class="sr-only" @change="choosePhoto" data-testid="photo-input" />
      </label>
      <img v-if="photo" :src="photo" alt="Your photo" class="max-h-64 rounded-lg" />
      <button class="btn-primary !bg-ink !text-white" :disabled="!photo || loading" @click="analyse" data-testid="analyse-btn">
        {{ loading ? 'Analysing…' : 'Analyse photo' }}
      </button>
      <p v-if="result" class="rounded-2xl border-[3px] border-ink bg-white px-3 py-2 text-sm font-bold" data-testid="analysis-result">
        Thanks! We estimate {{ result.peopleInQueue }} people in the queue, about {{ result.waitMins }} min wait,
        and {{ result.seatOccupancy }}% of seats taken ({{ result.confidence }} confidence).
      </p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
  <p v-else-if="error" class="error">{{ error }}</p>
  <p v-else>Loading…</p>
</template>
