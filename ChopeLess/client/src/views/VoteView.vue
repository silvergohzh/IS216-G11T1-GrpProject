<!-- Swipe deck + live tally. Owner: M3 -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { castVote } from '../services/sessions'
import PlaceCard from '../components/PlaceCard.vue'

const route = useRoute()
const router = useRouter()
const store = useSessionStore()
const code = route.params.code
const index = ref(0) // which card I'm on
const error = ref('')

const places = computed(() => store.session?.shortlist || [])
const current = computed(() => places.value[index.value])
const memberCount = computed(() => Object.keys(store.session?.members || {}).length)

onMounted(() => store.watch(code))
onUnmounted(() => store.stop())
watch(() => store.session?.status, s => { if (s === 'done') router.push(`/sessions/${code}/winner`) })

async function vote(yes) {
  error.value = ''
  try {
    await castVote(code, current.value.id, yes)
    index.value++
  } catch (err) { error.value = err.message }
}

// votes look like { placeId: { uid: true/false } }
function yesCount(placeId) {
  return Object.values(store.session?.votes?.[placeId] || {}).filter(Boolean).length
}
// TODO (M3): swipe gestures (pointer events) and a card slide-out animation
</script>

<template>
  <h1 class="page-title">Swipe to vote</h1>
  <div class="grid gap-4 md:grid-cols-2">
    <div>
      <PlaceCard v-if="current" :place="current" data-testid="vote-card">
        <div class="mt-4 flex justify-center gap-6">
          <button class="h-16 w-16 rounded-full border-2 border-red-300 text-2xl text-red-600" aria-label="No" data-testid="vote-no" @click="vote(false)">✕</button>
          <button class="h-16 w-16 rounded-full border-2 border-green-300 text-2xl text-brand" aria-label="Yes" data-testid="vote-yes" @click="vote(true)">✓</button>
        </div>
      </PlaceCard>
      <div v-else-if="places.length" class="card">You've voted on everything. Waiting for the others…</div>
      <p v-if="error" class="error mt-2">{{ error }}</p>
    </div>
    <div class="card">
      <h2 class="mb-2 font-bold">Live tally</h2>
      <ul class="divide-y divide-slate-100">
        <li v-for="p in places" :key="p.id" class="flex justify-between py-2">
          <span>{{ p.name }}</span>
          <span class="font-mono">{{ yesCount(p.id) }}/{{ memberCount }} yes</span>
        </li>
      </ul>
    </div>
  </div>
</template>
