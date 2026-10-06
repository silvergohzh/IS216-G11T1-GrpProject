<!-- Leaflet map with markers and an optional route line. Owner: M2
     Usage: <MapView :markers="[{ lat, lng, label }]" :route="[[lat, lng], ...]" @pick="onPick" /> -->
<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'

const props = defineProps({
  markers: { type: Array, default: () => [] },
  route: { type: Array, default: () => [] },
  center: { type: Array, default: () => [1.2966, 103.8502] } // SMU
})
const emit = defineEmits(['pick']) // fires { lat, lng } when the map is clicked (meeting point picker)

const el = ref(null)
let map, layer

function draw() {
  layer.clearLayers()
  props.markers.forEach(m => L.circleMarker([m.lat, m.lng], { radius: 8, color: '#237a4b' }).bindPopup(m.label || '').addTo(layer))
  if (props.route.length) L.polyline(props.route, { color: '#e0a526', weight: 5 }).addTo(layer)
}

onMounted(() => {
  map = L.map(el.value).setView(props.center, 16)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  map.on('click', e => emit('pick', { lat: e.latlng.lat, lng: e.latlng.lng }))
  draw()
})
watch(() => [props.markers, props.route], draw, { deep: true })
onBeforeUnmount(() => map?.remove())

// TODO (M2): get the real walking route from OSRM for the winner screen
</script>

<template>
  <div ref="el" class="h-72 w-full rounded-2xl" data-testid="map"></div>
</template>
