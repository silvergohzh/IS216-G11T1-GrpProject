<!-- This week's top 5 kakis, on the home page. Owner: M3
     The data comes from Janani's points API (/api/points/leaderboard); the full board stays on /points. -->
<script setup>
import { ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const auth = useAuthStore()
const top = ref([])
const loading = ref(false)
const error = ref('')
const MEDALS = ['#ffd23f', '#b8c0d0', '#c8814a']   // 1st gold, 2nd silver, 3rd bronze

async function load() {
  top.value = []
  error.value = ''
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    const data = await api('/points/leaderboard')
    top.value = (data.leaderboard || []).slice(0, 5)
  } catch {
    error.value = "The leaderboard couldn't load. Try again in a minute."
  } finally {
    loading.value = false
  }
}
watch(() => auth.user?.uid, load, { immediate: true })
</script>

<template>
  <section class="card" aria-labelledby="home-lb" data-testid="home-leaderboard">
    <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p class="kicker">This week</p>
        <h2 id="home-lb" class="text-3xl">Top kakis</h2>
      </div>
      <RouterLink to="/points" class="btn text-sm">Full leaderboard</RouterLink>
    </div>

    <p v-if="!auth.isLoggedIn" class="font-bold">Log in to see who's leading this week.</p>
    <p v-else-if="loading" class="font-bold">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!top.length" class="font-bold">No points yet this week. Finish a Makan Session to get on the board!</p>
    <ol v-else class="flex flex-col gap-2">
      <li v-for="(p, i) in top" :key="p.uid" data-testid="home-leader"
          class="flex items-center gap-3 rounded-2xl border-[3px] border-ink px-3 py-2 font-extrabold"
          :class="p.uid === auth.user?.uid ? 'bg-accent' : 'bg-white'">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-ink font-display text-lg"
              :style="{ background: MEDALS[i] || '#eaf6ff' }">{{ i + 1 }}</span>
        <span class="min-w-0 flex-1 truncate">{{ p.name || p.displayName }}<span v-if="p.uid === auth.user?.uid"> (you)</span></span>
        <span class="font-display text-xl font-normal">{{ p.points }} pts</span>
      </li>
    </ol>
  </section>
</template>