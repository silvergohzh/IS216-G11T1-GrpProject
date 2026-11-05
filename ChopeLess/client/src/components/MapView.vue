<!-- Leaflet map with markers and an optional route line. Owner: M2
     Usage: <MapView :markers="[{ lat, lng, label, icon }]" :route="[[lat, lng], ...]" @pick="onPick" />
     icon (optional): 'start' = a person badge, 'finish' = a chequered-flag badge. Without it: a round dot. -->
<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'

// ---------- Start and finish badges ----------
// A round white badge with a navy border and a small drawing inside, so start and finish are easy to tell apart.
const NAVY = '#17213b'
const ORANGE = '#ff7a45'

// Start: a simple person (orange head and body, navy outline)
const PERSON_SVG = `
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="7" r="4" fill="${ORANGE}" stroke="${NAVY}" stroke-width="2" />
    <path d="M4 22v-2a8 8 0 0 1 16 0v2z" fill="${ORANGE}" stroke="${NAVY}" stroke-width="2" stroke-linejoin="round" />
  </svg>`

// Finish: a flag on a pole. The flag is 3 x 2 squares, black and white like a race's finish line.
const FLAG_SVG = `
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <line x1="5" y1="3" x2="5" y2="22" stroke="${NAVY}" stroke-width="2.5" stroke-linecap="round" />
    <circle cx="5" cy="3" r="2" fill="${ORANGE}" />
    <rect x="6" y="4" width="15" height="10" fill="#ffffff" />
    <rect x="6" y="4" width="5" height="5" fill="#000000" />
    <rect x="16" y="4" width="5" height="5" fill="#000000" />
    <rect x="11" y="9" width="5" height="5" fill="#000000" />
    <rect x="6" y="4" width="15" height="10" fill="none" stroke="${NAVY}" stroke-width="1.5" />
  </svg>`

// Turns a drawing into a Leaflet marker icon. aria-label tells screen readers what the badge means.
function badgeIcon(svg, label) {
  const badgeStyle = 'width:32px;height:32px;border-radius:50%;background:#ffffff;' +
    `border:3px solid ${NAVY};box-shadow:0 2px 0 ${NAVY};box-sizing:border-box;` +
    'display:flex;align-items:center;justify-content:center;'
  return L.divIcon({
    className: '',            // no Leaflet default white square behind our badge
    html: `<div role="img" aria-label="${label}" style="${badgeStyle}">${svg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],     // the middle of the badge sits on the spot
    popupAnchor: [0, -16]     // the popup opens just above the badge
  })
}

const BADGES = {
  start: badgeIcon(PERSON_SVG, 'Start point'),
  finish: badgeIcon(FLAG_SVG, 'Finish line')
}

const props = defineProps({
  markers: { type: Array, default: () => [] },
  route: { type: Array, default: () => [] },
  center: { type: Array, default: () => [1.2966, 103.8502] } // SMU
})
const emit = defineEmits(['pick']) // fires { lat, lng } when the map is clicked (meeting point picker)

const el = ref(null)
let map, layer
let lastPannedTo = ''   // the marker we last moved the map to, so we only move when it changes

function draw() {
  layer.clearLayers()
  props.markers.forEach(m => {
    if (BADGES[m.icon]) {
      // Start or finish badge. Leaflet draws badges in a layer ABOVE lines, so the finish flag sits on top of the route.
      // bubblingMouseEvents: a click on the badge still counts as a click on the map (same as the round dots).
      L.marker([m.lat, m.lng], { icon: BADGES[m.icon], bubblingMouseEvents: true })
        .bindPopup(m.label || '')
        .addTo(layer)
    } else {
      // Round dot: navy outline, filled with m.color if given, else orange
      L.circleMarker([m.lat, m.lng], {
        radius: m.radius || 9, color: NAVY, weight: 3, fillColor: m.color || ORANGE, fillOpacity: 1
      }).bindPopup(m.label || '').addTo(layer)
    }
  })
  if (props.route.length) {
    // Walking route: a thick white line underneath + orange dashes on top, so it stands out on the map
    L.polyline(props.route, { color: '#ffffff', weight: 10, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(layer)
    const line = L.polyline(props.route, { color: '#ff7a45', weight: 5, dashArray: '10 10', lineCap: 'round', lineJoin: 'round' }).addTo(layer)
    map.fitBounds(line.getBounds(), { padding: [32, 32] }) // show the whole walk, not just the destination
  } else if (props.markers.length === 1) {
    // One marker and no route (e.g. the meeting point, or "My location" far away): move the map to it.
    // Only when the marker moves, so the map doesn't jump back every time something else changes.
    const m = props.markers[0]
    const key = `${m.lat},${m.lng}`
    if (key !== lastPannedTo) {
      map.panTo([m.lat, m.lng])
      lastPannedTo = key
    }
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
