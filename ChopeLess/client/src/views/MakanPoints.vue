<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { auth } from '../lib/firebase'
import PointsHistory from '../components/PointsHistory.vue'
import CrowdReports from '../components/CrowdReports.vue'
import CrowdReportVerifier from '../components/CrowdReportVerifier.vue'

const authStore = useAuthStore()

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/points`

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
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="kicker">Station 6 · Reward Lighthouse</p>
        <h1 class="page-title">
          Makan Points
        </h1>
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
      <div class="card card-navy">
        <p class="text-sm font-black tracking-wider text-accent">BALANCE</p>
        <p class="mt-2 font-display text-6xl">
          {{ balance }}
        </p>
        <p class="mt-2 text-xs font-bold text-white/80">
          Your current points balance
        </p>
      </div>

      <div class="card">
        <p class="text-sm font-black tracking-wider">LIFETIME</p>
        <p class="mt-2 font-display text-6xl">
          {{ lifetimePoints }}
        </p>
        <p class="mt-2 text-xs text-slate-500">
          Used to unlock achievement badges
        </p>
      </div>

      <div class="card" :class="priorityEligible ? 'card-sun' : ''">
        <p class="text-sm font-black tracking-wider">
          PRIORITY PICKUP
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
      <h2>Badges</h2>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div
          v-for="badge in badgeLevels"
          :key="badge.id"
          class="rounded-2xl border-[3px] border-ink p-4 text-center"
          :class="hasBadge(badge.id) ? '' : 'border-dashed bg-white'"
          :style="hasBadge(badge.id) ? { background: { bronze: '#f3d8bf', silver: '#e6eaf2', gold: '#fff2b8' }[badge.id] } : {}"
        >
                  <!-- the medal: bronze / silver / gold colour once unlocked, dashed outline while locked -->
          <span
            class="mx-auto mb-2 block h-14 w-14 rounded-full border-4 border-ink"
            :class="hasBadge(badge.id) ? '' : 'border-dashed'"
            :style="{ background: hasBadge(badge.id) ? { bronze: '#c8814a', silver: '#b8c0d0', gold: '#ffd23f' }[badge.id] : '#ffffff' }"
            aria-hidden="true"
          ></span>
          <p class="font-display text-2xl">{{ badge.name }}</p>

          <p class="mt-1 text-sm text-slate-600">
            {{ badge.required }} lifetime points
          </p>

          <p
            class="mt-2 text-sm font-semibold"
            :class="hasBadge(badge.id)
              ? 'text-green-700'
              : 'text-slate-500'"
          >
            {{ hasBadge(badge.id) ? 'Unlocked' : `${Math.max(0, badge.required - lifetimePoints)} pts to go` }}
          </p>
        </div>
             </div>
      <!-- progress towards Gold (300 lifetime points) -->
      <div class="mt-4 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-sky" role="progressbar"
           :aria-valuenow="lifetimePoints" aria-valuemin="0" aria-valuemax="300" aria-label="Progress to Gold">
        <div class="h-full bg-accent" :style="{ width: Math.min(100, lifetimePoints / 300 * 100) + '%' }"></div> 

      </div>
    </div>

    <div class="card">
      <h2>This week's leaderboard</h2>

      <p class="mt-1 text-sm text-slate-600">
        Top 20 users by points earned this week.
      </p>

      <div
        v-if="!loading && leaderboard.length === 0"
        class="mt-4 text-sm text-slate-500"
      >
        No points earned this week yet.
      </div>

      <ol v-else class="mt-4 flex flex-col gap-2">
        <li
          v-for="entry in leaderboard"
          :key="entry.uid"
          class="flex items-center gap-3 rounded-2xl border-[3px] border-ink px-4 py-2"
          :class="entry.uid === authStore.user?.uid ? 'bg-accent' : entry.rank === 1 ? 'bg-sky' : 'bg-white'"
        >
          <span class="w-8 font-display text-2xl">{{ entry.rank }}</span>
          <!-- the server sends each person's display name; fall back to a short id -->
          <span class="flex-1 font-black">
            {{ entry.name || entry.displayName || `User ${entry.uid.slice(0, 6)}` }}
            <span v-if="entry.uid === authStore.user?.uid"> (you)</span>
          </span>
          <span class="font-black">{{ entry.points }} pts</span>
        </li>
      </ol>
    </div>

        <p class="card card-sun text-sm font-bold">
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