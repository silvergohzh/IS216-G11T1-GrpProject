<!-- One place: hourly trend + "analyse a photo". Owner: M4 -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getPlace, analysePhoto } from '../services/places'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const auth = useAuthStore()
const place = ref(null)
const result = ref(null)
const error = ref('')

async function load() {
  try { place.value = await getPlace(route.params.id) } catch (err) { error.value = err.message }
}
onMounted(load)

// Read the chosen image as base64 and send it to the server, which calls Gemini
function analyse(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      result.value = await analysePhoto(route.params.id, reader.result.split(',')[1])
      load()
    } catch (err) { error.value = err.message }
  }
  reader.readAsDataURL(file)
}
// TODO (M4): confidence badge and "best time to go"
</script>

<template>
  <div v-if="place" class="space-y-4">
    <h1 class="page-title">{{ place.name }}</h1>
    <p class="text-slate-600">{{ place.address }}</p>

    <div class="card">
      <h2 class="mb-3 font-bold">Average wait by hour</h2>
      <!-- Simple CSS bar chart. Swap for Chart.js later if you like. -->
      <div class="flex h-40 items-end gap-1 overflow-x-auto">
        <div v-for="t in place.trend" :key="t.hour" class="flex min-w-6 flex-1 flex-col items-center gap-1">
          <div class="w-full rounded-t bg-brand" :style="{ height: Math.max(4, t.avgWait * 5) + 'px' }" :title="Math.round(t.avgWait) + ' min'"></div>
          <span class="text-[10px] text-slate-500">{{ t.hour }}</span>
        </div>
      </div>
    </div>

    <div v-if="auth.isLoggedIn" class="card space-y-2">
      <h2 class="font-bold">Analyse a queue photo</h2>
      <input type="file" accept="image/*" @change="analyse" data-testid="photo-input" />
      <p v-if="result" class="text-sm">{{ result.peopleInQueue }} people · ~{{ result.waitMins }} min · {{ result.seatOccupancy }}% seats · {{ result.confidence }} confidence</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
  <p v-else-if="error" class="error">{{ error }}</p>
  <p v-else>Loading…</p>
</template>
