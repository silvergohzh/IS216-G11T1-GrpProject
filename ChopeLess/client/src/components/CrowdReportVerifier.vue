
<script setup>
import { ref, onMounted } from 'vue'
import { auth } from '../lib/firebase'

const API = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/crowd-reports`

const authorized = ref(false)
const checking = ref(true)
const loading = ref(false)
const pending = ref([])
const busyId = ref('')
const error = ref('')
const message = ref('')

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

async function checkAccess() {
  checking.value = true
  error.value = ''

  try {
    await request('/verifier-access')
    authorized.value = true
    await loadPending()
  } catch (err) {
    authorized.value = false

    // 403 means this user is not a verifier.
    if (err.message !== 'Only authorized verifiers can review crowd reports') {
      error.value = err.message
    }
  } finally {
    checking.value = false
  }
}

async function loadPending() {
  loading.value = true
  error.value = ''

  try {
    pending.value = await request('/pending')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function verify(report, valid) {
  busyId.value = report.id
  error.value = ''
  message.value = ''

  try {
    await request(`/${encodeURIComponent(report.id)}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ valid })
    })

    message.value = valid
      ? 'Report approved. +15 Makan Points processed.'
      : 'Report rejected. −10 Makan Points processed.'

    await loadPending()
  } catch (err) {
    error.value = err.message
  } finally {
    busyId.value = ''
  }
}

onMounted(checkAccess)
</script>

<template>
  <section v-if="checking" class="mx-auto max-w-3xl p-6">
    <p class="text-sm text-gray-500">Checking verifier access...</p>
  </section>

  <section
    v-else-if="authorized"
    class="mx-auto max-w-3xl space-y-5 p-6"
  >
    <div>
      <h2 class="text-2xl font-bold">Crowd Report Verification</h2>
      <p class="text-sm text-gray-600">
        Review submitted reports before awarding Makan Points.
      </p>
    </div>

    <p v-if="error" class="text-sm text-red-600">
      {{ error }}
    </p>

    <p v-if="message" class="text-sm text-green-700">
      {{ message }}
    </p>

    <div class="rounded-xl border bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">Pending reports</h3>

        <button
          type="button"
          class="text-sm font-medium text-orange-600"
          @click="loadPending"
        >
          Refresh
        </button>
      </div>

      <p v-if="loading" class="text-sm text-gray-500">
        Loading reports...
      </p>

      <p v-else-if="pending.length === 0" class="text-sm text-gray-500">
        No reports awaiting verification.
      </p>

      <div v-else class="space-y-4">
        <div
          v-for="report in pending"
          :key="report.id"
          class="rounded-lg border p-4"
        >
          <p class="font-semibold">Place: {{ report.placeId }}</p>
          <p class="text-sm">
            Estimated queue: {{ report.queueMinutes }} minutes
          </p>
          <p v-if="report.comment" class="mt-1 text-sm">
            {{ report.comment }}
          </p>
          <p class="mt-1 text-xs text-gray-500">
            Submitted by: {{ report.uid }}
          </p>

          <div class="mt-4 flex gap-3">
            <button
              type="button"
              :disabled="busyId !== ''"
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              @click="verify(report, true)"
            >
              {{ busyId === report.id ? 'Processing...' : 'Approve (+15)' }}
            </button>

            <button
              type="button"
              :disabled="busyId !== ''"
              class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              @click="verify(report, false)"
            >
              {{ busyId === report.id ? 'Processing...' : 'Reject (−10)' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <p v-else-if="error" class="p-6 text-sm text-red-600">
    {{ error }}
  </p>
</template>
