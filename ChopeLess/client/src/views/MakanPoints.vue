
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { auth } from '../lib/firebase'
import PointsHistory from '../components/PointsHistory.vue'
import CrowdReports from '../components/CrowdReports.vue'
import CrowdReportVerifier from '../components/CrowdReportVerifier.vue'

const authStore = useAuthStore()

const API_URL = 'http://localhost:3000/api/points'

const account = ref(null)
const leaderboard = ref([])
const loading = ref(false)
const error = ref('')

const badges = computed(() => account.value?.badges || [])
const balance = computed(() => account.value?.balance ?? 0)
const lifetimePoints = computed(
  () => account.value?.lifetimePoints ?? 0
)
const priorityEligible = computed(
  () => account.value?.priorityEligible ?? false
)

const badgeLevels = [
  { id: 'bronze', name: 'Bronze', required: 50 },
  { id: 'silver', name: 'Silver', required: 150 },
  { id: 'gold', name: 'Gold', required: 300 }
]

function hasBadge(id) {
  return badges.value.includes(id)
}

async function apiGet(path) {
  const fbUser = auth.currentUser

  if (!fbUser) {
    throw new Error('Please log in to view Makan Points.')
  }

  const token = await fbUser.getIdToken()

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`

    try {
      const data = await response.json()
      message = data.error || data.message || message
    } catch {
      // Use the HTTP status message.
    }

    throw new Error(message)
  }

  return response.json()
}

async function loadPoints() {
  if (!authStore.isLoggedIn) {
    account.value = null
    leaderboard.value = []
    return
  }

  loading.value = true
  error.value = ''

  try {
    const [accountData, leaderboardData] = await Promise.all([
      apiGet('/me'),
      apiGet('/leaderboard')
    ])

    account.value = accountData
    leaderboard.value = leaderboardData.leaderboard || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

watch(
  () => authStore.user?.uid,
  () => loadPoints()
)

onMounted(() => {
  loadPoints()
})
</script>

<template>
  <section class="mt-10 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-green-700">
          CHOPELESS REWARDS
        </p>
        <h2 class="text-2xl font-extrabold">
          Makan Points
        </h2>
        <p class="text-sm text-slate-600">
          Earn points, unlock badges and climb the leaderboard.
        </p>
      </div>

      <button
        type="button"
        class="btn"
        :disabled="loading"
        @click="loadPoints"
      >
        {{ loading ? 'Loading...' : 'Refresh points' }}
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 p-4 text-red-700">
      {{ error }}
    </p>

    <div v-if="account" class="grid gap-4 md:grid-cols-3">
      <div class="card">
        <p class="text-sm text-slate-500">Available Points</p>
        <p class="mt-2 text-4xl font-extrabold text-green-700">
          {{ balance }}
        </p>
        <p class="mt-2 text-xs text-slate-500">
          Your current points balance
        </p>
      </div>

      <div class="card">
        <p class="text-sm text-slate-500">Lifetime Points</p>
        <p class="mt-2 text-4xl font-extrabold">
          {{ lifetimePoints }}
        </p>
        <p class="mt-2 text-xs text-slate-500">
          Used to unlock achievement badges
        </p>
      </div>

      <div class="card">
        <p class="text-sm text-slate-500">
          Priority Queue Eligibility
        </p>

        <p
          class="mt-2 text-xl font-bold"
          :class="priorityEligible
            ? 'text-green-700'
            : 'text-slate-700'"
        >
          {{ priorityEligible ? 'Eligible' : 'Not yet eligible' }}
        </p>

        <p class="mt-2 text-sm text-slate-600">
          {{
            priorityEligible
              ? 'You have reached the required points balance.'
              : `${Math.max(0, 150 - balance)} more points needed.`
          }}
        </p>

        <p class="mt-2 text-xs text-slate-500">
          Eligibility only; actual priority access depends
          on the queue feature.
        </p>
      </div>
    </div>

    <div class="card">
      <h3 class="text-lg font-bold">Achievement Badges</h3>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div
          v-for="badge in badgeLevels"
          :key="badge.id"
          class="rounded-xl border p-4"
          :class="hasBadge(badge.id)
            ? 'border-green-500 bg-green-50'
            : 'border-slate-200 bg-slate-50 opacity-60'"
        >
          <p class="font-bold">{{ badge.name }}</p>

          <p class="mt-1 text-sm text-slate-600">
            {{ badge.required }} lifetime points
          </p>

          <p
            class="mt-2 text-sm font-semibold"
            :class="hasBadge(badge.id)
              ? 'text-green-700'
              : 'text-slate-500'"
          >
            {{ hasBadge(badge.id) ? 'Unlocked' : 'Locked' }}
          </p>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="text-lg font-bold">Weekly Leaderboard</h3>

      <p class="mt-1 text-sm text-slate-600">
        Top 20 users by points earned this week.
      </p>

      <div
        v-if="!loading && leaderboard.length === 0"
        class="mt-4 text-sm text-slate-500"
      >
        No points earned this week yet.
      </div>

      <div v-else class="mt-4 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b bg-slate-50">
            <tr>
              <th class="p-3">Rank</th>
              <th class="p-3">User</th>
              <th class="p-3 text-right">Points</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="entry in leaderboard"
              :key="entry.uid"
              class="border-b"
              :class="entry.uid === authStore.user?.uid
                ? 'bg-green-50 font-semibold'
                : ''"
            >
              <td class="p-3">{{ entry.rank }}</td>

              <td class="p-3">
                {{
                  entry.uid === authStore.user?.uid
                    ? 'You'
                    : `User ${entry.uid.slice(0, 6)}`
                }}
              </td>

              <td class="p-3 text-right">
                {{ entry.points }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-xs text-slate-500">
      Earn 10 points when your group completes a Makan Session,
      plus 5 bonus points if you are the host.
      Verified crowd reports earn 15 points;
      invalid reports incur a 10-point penalty.
    </p>
    <CrowdReports />
    <CrowdReportVerifier />
    <PointsHistory />
  </section>
</template>
