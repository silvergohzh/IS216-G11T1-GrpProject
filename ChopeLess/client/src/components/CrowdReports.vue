
<script setup>
import { ref, onMounted } from 'vue'
import { auth } from '../lib/firebase'
import { db } from '../lib/firebase'
import { collection, getDocs } from 'firebase/firestore'

const API = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/crowd-reports`

const placeId = ref('')
const places = ref([])
const placesLoading = ref(false)

async function loadPlaces() {
  placesLoading.value = true

  try {
    const snapshot = await getDocs(collection(db, 'places'))

    places.value = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || doc.data().title || doc.id
    }))
  } catch (err) {
    error.value = 'Unable to load restaurants: ' + err.message
  } finally {
    placesLoading.value = false
  }
}
const queueMinutes = ref(0)
const comment = ref('')

const reports = ref([])
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref('')

async function request(path, options = {}) {
  const user = auth.currentUser

  if (!user) {
    throw new Error('Please log in first')
  }

  const token = await user.getIdToken()

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

async function loadReports() {
  loading.value = true
  error.value = ''

  try {
    reports.value = await request('/mine')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function submitReport() {
  submitting.value = true
  error.value = ''
  success.value = ''

  try {
    await request('/', {
      method: 'POST',
      body: JSON.stringify({
        placeId: placeId.value.trim(),
        queueMinutes: Number(queueMinutes.value),
        comment: comment.value
      })
    })

    success.value = 'Report submitted! Points will be updated after verification.'
    placeId.value = ''
    queueMinutes.value = 0
    comment.value = ''

    await loadReports()
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}

function statusLabel(report) {
  if (report.verificationStatus !== 'verified') {
    return 'Pending verification'
  }

  return report.valid ? 'Verified (+15 points)' : 'Invalid (−10 points)'
}

onMounted(() => {
  loadPlaces()

  if (auth.currentUser) {
    loadReports()
  }
})
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-6 p-6">
    <div>
      <h2 class="text-2xl font-bold">QueueLess Crowd Reports</h2>
      <p class="text-sm text-gray-600">
        Share queue waiting times and earn Makan Points after verification.
      </p>
    </div>

    <form
      class="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
      @submit.prevent="submitReport"
    >
      <h3 class="text-lg font-semibold">Submit a report</h3>

      <div>
  <label class="mb-1 block text-sm font-medium">
    Restaurant
  </label>

  <select
    v-model="placeId"
    required
    class="w-full rounded-lg border p-2"
  >
    <option disabled value="">
      {{ placesLoading ? 'Loading restaurants...' : 'Select a restaurant' }}
    </option>

    <option
      v-for="place in places"
      :key="place.id"
      :value="place.id"
    >
      {{ place.name }}
    </option>
  </select>

  <p v-if="!placesLoading && places.length === 0"
     class="mt-1 text-sm text-gray-500">
    No restaurants available.
  </p>
</div>

      <div>
        <label class="mb-1 block text-sm font-medium">
          Estimated queue time (minutes)
        </label>
        <input
          v-model.number="queueMinutes"
          type="number"
          min="0"
          max="240"
          required
          class="w-full rounded-lg border p-2"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium">Comment (optional)</label>
        <textarea
          v-model="comment"
          maxlength="500"
          rows="3"
          class="w-full rounded-lg border p-2"
          placeholder="Describe the queue..."
        ></textarea>
      </div>

      <button
        type="submit"
        :disabled="submitting"
        class="rounded-lg bg-orange-500 px-5 py-2 font-semibold text-white disabled:opacity-50"
      >
        {{ submitting ? 'Submitting...' : 'Submit report' }}
      </button>

      <p v-if="success" class="text-sm text-green-700">
        {{ success }}
      </p>
      <p v-if="error" class="text-sm text-red-600">
        {{ error }}
      </p>
    </form>

    <div class="rounded-xl border bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">My reports</h3>

        <button
          type="button"
          class="text-sm font-medium text-orange-600"
          @click="loadReports"
        >
          Refresh
        </button>
      </div>

      <p v-if="loading" class="text-sm text-gray-500">
        Loading reports...
      </p>

      <p v-else-if="reports.length === 0" class="text-sm text-gray-500">
        No reports submitted yet.
      </p>

      <div v-else class="space-y-3">
        <div
          v-for="report in reports"
          :key="report.id"
          class="rounded-lg border p-3"
        >
          <p class="font-medium">Place: {{ report.placeId }}</p>
          <p class="text-sm">Queue: {{ report.queueMinutes }} minutes</p>
          <p v-if="report.comment" class="text-sm">
            {{ report.comment }}
          </p>

          <p class="mt-2 text-sm font-semibold">
            {{ statusLabel(report) }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
