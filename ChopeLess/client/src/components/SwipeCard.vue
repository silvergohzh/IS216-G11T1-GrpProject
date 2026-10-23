<!-- A place card you can drag left (no) or right (yes). Owner: M3 -->
<script setup>
import { ref, computed, onUnmounted } from 'vue'
import PlaceCard from './PlaceCard.vue'
 
defineProps({ place: { type: Object, required: true } })
const emit = defineEmits(['vote'])
 
const el = ref(null)
const dx = ref(0)          // how far the card has been dragged sideways (px), drives the YES / NOPE labels
let startX = 0
let startTime = 0
let dragging = false
let leaving = false        // true while the card flies off, so it can't be dragged or voted twice
let frame = 0              // requestAnimationFrame id
 
const THRESHOLD = 110      // drag further than this = a vote
const FLICK_SPEED = 0.6    // or flick faster than this (px per ms), even if the drag was short
 
// Move the card directly (no Vue re-render per mouse move): this is what makes it smooth
function paint(x, withTransition) {
  const card = el.value
  if (!card) return
  card.style.transition = withTransition ? 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
  card.style.transform = `translateX(${x}px) rotate(${x / 18}deg)`
}
 
function onDown(e) {
  if (leaving || e.button > 0) return
  dragging = true
  startX = e.clientX
  startTime = performance.now()
  el.value.setPointerCapture(e.pointerId)   // keep getting moves even if the pointer leaves the card
}
 
function onMove(e) {
  if (!dragging) return
  const x = e.clientX - startX
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {      // at most one update per screen refresh
    paint(x, false)
    dx.value = x
  })
}
 
function onUp(e) {
  if (!dragging) return
  dragging = false
  cancelAnimationFrame(frame)
  const x = e.clientX - startX
  const speed = Math.abs(x) / Math.max(1, performance.now() - startTime)
  if (Math.abs(x) > THRESHOLD || (Math.abs(x) > 40 && speed > FLICK_SPEED)) {
    fling(x > 0)
  } else {
    dx.value = 0
    paint(0, true)                            // not far enough: spring back to the middle
  }
}
 
// Fly the card off screen, then tell the page which way it went
function fling(yes) {
  if (leaving) return
  leaving = true
  dx.value = yes ? 200 : -200                 // show the YES / NOPE label while it flies
  const card = el.value
  const distance = (window.innerWidth || 800) + 200
  card.style.transition = 'transform 0.3s ease-in'
  card.style.transform = `translateX(${yes ? distance : -distance}px) rotate(${yes ? 25 : -25}deg)`
  setTimeout(() => emit('vote', yes), 280)    // emit just before it disappears; the page swaps in the next card
}
 
onUnmounted(() => cancelAnimationFrame(frame))
defineExpose({ fling })
 
const yesOpacity = computed(() => Math.min(1, Math.max(0, dx.value / THRESHOLD)))
const noOpacity = computed(() => Math.min(1, Math.max(0, -dx.value / THRESHOLD)))
</script>
 
<template>
  <div ref="el"
       class="relative cursor-grab select-none active:cursor-grabbing"
       style="touch-action: pan-y; will-change: transform"
       data-testid="swipe-card"
       @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
        <span class="pointer-events-none absolute left-6 top-1/2 z-20 -translate-y-1/2 -rotate-12 rounded-xl border-4 border-green-500 bg-white px-4 py-1 text-3xl font-extrabold text-green-600 shadow-lg"
          :style="{ opacity: yesOpacity }">YES</span>
        <span class="pointer-events-none absolute right-6 top-1/2 z-20 -translate-y-1/2 rotate-12 rounded-xl border-4 border-red-500 bg-white px-4 py-1 text-3xl font-extrabold text-red-600 shadow-lg"
          :style="{ opacity: noOpacity }">NOPE</span>
    <PlaceCard :place="place" class="relative z-0" />
  </div>
</template>