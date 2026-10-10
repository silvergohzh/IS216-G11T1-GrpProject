<!-- Winner screen with walking route. Owner: M3 (page), M2 (route map) -->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { api } from '../lib/api'
import PlaceCard from '../components/PlaceCard.vue'
import MapView from '../components/MapView.vue'

const route = useRoute()
const store = useSessionStore()
onMounted(() => store.watch(route.params.code))
onUnmounted(() => store.stop())

const winner = computed(() => store.session?.winner)
const from = computed(() => store.session?.meetingPoint)

// Walking route from the server (OSRM). Shows a straight line until it arrives, or if the request fails.
const path = ref([])
watch(() => winner.value?.id, async id => {
  if (!id || !from.value) return
  path.value = [[from.value.lat, from.value.lng], [winner.value.lat, winner.value.lng]]
  try {
    const data = await api(`/shortlist/${route.params.code}/route`)
    if (data.route.length) path.value = data.route
  } catch { /* keep the straight line */ }
}, { immediate: true })
</script>

<template>
  <div v-if="winner" class="space-y-4">
    <p class="label">It's a match</p>
    <h1 class="text-3xl font-extrabold text-brand" data-testid="winner-name">{{ winner.name }}</h1>
    <PlaceCard :place="winner" />
    <MapView :center="[winner.lat, winner.lng]"
             :markers="[{ lat: winner.lat, lng: winner.lng, label: winner.name }, ...(from ? [{ ...from, label: 'Meeting point' }] : [])]"
             :route="path" />
  </div>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>
  <p v-else>Loading…</p>
</template>
