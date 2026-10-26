
<script setup>
import { ref, onMounted } from 'vue'
import { auth } from '../lib/firebase'

const history = ref([])
const loading = ref(false)
const error = ref('')

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/points`

const reasonLabels = {
  SESSION_COMPLETE: 'Completed a Makan Session',
  HOST_BONUS: 'Hosted a Makan Session',
  VERIFIED_REPORT: 'Verified crowd report',
  INVALID_REPORT: 'Invalid crowd report',
  'Extra Super Like': 'Bought an extra Super Like ⭐'
}

function formatReason(reason) {
  return reasonLabels[reason] || reason || 'Points adjustment'
}

function formatDate(timestamp) {
  if (!timestamp) return '-'

  return new Date(timestamp).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore'
  })
}

async function loadHistory() {
  loading.value = true
  error.value = ''

  try {
    const user = auth.currentUser

    if (!user) {
      history.value = []
      return
    }

    const token = await user.getIdToken()

    const response = await fetch(`${API_URL}/history`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to load history (${response.status})`)
    }

    const data = await response.json()
    history.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(loadHistory)

defineExpose({ loadHistory })
</script>

<template>
  <div class="card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2>Points history</h2>
        <p class="text-sm text-slate-600">
          Your recent rewards and deductions.
        </p>
      </div>

      <button
        type="button"
        class="btn"
        :disabled="loading"
        @click="loadHistory"
      >
        {{ loading ? 'Loading...' : 'Refresh history' }}
      </button>
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-700">
      {{ error }}
    </p>

    <p
      v-if="!loading && !error && history.length === 0"
      class="mt-4 text-sm text-slate-500"
    >
      No points transactions yet.
    </p>

    <div v-if="history.length" class="mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm">
      <thead class="border-b-[3px] border-ink bg-sky">
          <tr>
            <th class="p-3">Date</th>
            <th class="p-3">Activity</th>
            <th class="p-3 text-right">Points</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="entry in history"
            :key="entry.id"
            class="border-b-2 border-sky"
          >
            <td class="p-3 text-slate-600">
              {{ formatDate(entry.createdAt) }}
            </td>

            <td class="p-3">
              <p class="font-medium">
                {{ formatReason(entry.reason) }}
              </p>

              <p
                v-if="entry.sessionCode"
                class="text-xs text-slate-500"
              >
                Session: {{ entry.sessionCode }}
              </p>

              <p
                v-if="entry.status === 'reversed'"
                class="text-xs text-amber-700"
              >
                Reversed
              </p>
            </td>

            <td
              class="p-3 text-right font-bold"
              :class="entry.status === 'reversed'
                ? 'text-slate-400'
                : entry.points >= 0
                  ? 'text-green-700'
                  : 'text-red-700'"
            >
              {{ entry.points > 0 ? '+' : '' }}{{ entry.points }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
