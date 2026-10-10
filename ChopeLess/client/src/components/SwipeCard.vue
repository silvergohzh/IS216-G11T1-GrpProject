<!-- A place card you can drag left (no) or right (yes). Owner: M3 -->
<script setup>
import { ref, computed } from 'vue'
import PlaceCard from './PlaceCard.vue'

defineProps({ place: { type: Object, required: true } })
const emit = defineEmits(['vote']) // sends true (yes) or false (no) to the parent page

const THRESHOLD = 100      // drag further than 100px to count as a vote
const dx = ref(0)          // how far the card has been dragged sideways
const dragging = ref(false)
const leaving = ref(0)     // 1 = flying off right, -1 = flying off left, 0 = staying
let startX = 0

function onDown(e) {
  dragging.value = true
  startX = e.clientX
  e.currentTarget.setPointerCapture(e.pointerId) // keep tracking even if the finger leaves the card
}
function onMove(e) {
  if (dragging.value) dx.value = e.clientX - startX
}
function onUp() {
  if (!dragging.value) return
  dragging.value = false
  if (Math.abs(dx.value) > THRESHOLD) fling(dx.value > 0)
  else dx.value = 0 // not far enough: snap back to the middle
}

// Animate the card off screen, then tell the parent which way it went
function fling(yes) {
  leaving.value = yes ? 1 : -1
  setTimeout(() => emit('vote', yes), 250)
}

const style = computed(() => {
  const x = leaving.value ? leaving.value * 600 : dx.value
  return {
    transform: `translateX(${x}px) rotate(${x / 20}deg)`, // translateX(130px) moves the card 130px right. 
                                // rotate(130 / 20 = 6.5deg) tilts it slightly, like a Tinder card. The further you drag, the more it tilts.
    transition: dragging.value ? 'none' : 'transform 0.25s ease'
  }
})
const hint = computed(() => (dx.value > 40 ? 'yes' : dx.value < -40 ? 'no' : '')) // dx refers to distance

defineExpose({ fling }) // lets the parent's ✓ / ✕ buttons trigger the same animation
</script>

<template>
  <div class="relative cursor-grab touch-none select-none active:cursor-grabbing" :style="style"
       @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" data-testid="swipe-card">
    <span v-if="hint === 'yes'" class="absolute left-4 top-4 z-10 -rotate-12 rounded-lg border-4 border-green-500 bg-white px-3 py-1 text-2xl font-extrabold text-green-600">YES</span>
    <span v-if="hint === 'no'" class="absolute right-4 top-4 z-10 rotate-12 rounded-lg border-4 border-red-500 bg-white px-3 py-1 text-2xl font-extrabold text-red-600">NOPE</span>
    <PlaceCard :place="place" />
  </div>
</template>