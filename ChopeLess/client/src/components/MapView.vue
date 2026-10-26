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
    // Markers: navy outline, filled with m.color if given (winner = yellow, meeting point = navy), else orange
  props.markers.forEach(m => L.circleMarker([m.lat, m.lng], {
    radius: m.radius || 9, color: '#17213b', weight: 3, fillColor: m.color || '#ff7a45', fillOpacity: 1
  }).bindPopup(m.label || '').addTo(layer))
  if (props.route.length) {
    // Walking route: a thick white line underneath + orange dashes on top, so it stands out on the map
    L.polyline(props.route, { color: '#ffffff', weight: 10, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(layer)
    const line = L.polyline(props.route, { color: '#ff7a45', weight: 5, dashArray: '10 10', lineCap: 'round', lineJoin: 'round' }).addTo(layer)
    map.fitBounds(line.getBounds(), { padding: [32, 32] }) // show the whole walk, not just the destination
  }
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
</script>

<template>
  <div ref="el" class="h-72 w-full rounded-2xl border-[3px] border-ink" data-testid="map"></div>
</template>
