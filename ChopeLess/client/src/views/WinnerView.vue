<!-- Winner screen with walking route. Owner: M3 (page), M2 (route map) -->
<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '../stores/session'
import PlaceCard from '../components/PlaceCard.vue'
import MapView from '../components/MapView.vue'

const route = useRoute()
const store = useSessionStore()
onMounted(() => store.watch(route.params.code))
onUnmounted(() => store.stop())

const winner = computed(() => store.session?.winner)
const from = computed(() => store.session?.meetingPoint)
</script>

<template>
  <div v-if="winner" class="space-y-4">
    <p class="label">It's a match</p>
    <h1 class="text-3xl font-extrabold text-brand" data-testid="winner-name">{{ winner.name }}</h1>
    <PlaceCard :place="winner" />
    <!-- TODO (M2): replace this straight line with the OSRM walking route -->
    <MapView :center="[winner.lat, winner.lng]"
             :markers="[{ lat: winner.lat, lng: winner.lng, label: winner.name }, ...(from ? [{ ...from, label: 'Meeting point' }] : [])]"
             :route="from ? [[from.lat, from.lng], [winner.lat, winner.lng]] : []" />
  </div>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>
  <p v-else>Loading…</p>
</template>
