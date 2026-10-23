<!-- Spin wheel for ties. Lands on the winner the server already picked. Owner: M3 -->
<!-- Numbers on the wheel + a colour legend underneath, so long names never get squashed. -->
<script setup>
import { ref, computed, onMounted } from 'vue'
 
const props = defineProps({
  candidates: { type: Array, required: true },  // [{ id, name }], max 6 (the server caps it)
  winnerId: { type: String, required: true }
})
const emit = defineEmits(['done'])
 
const COLOURS = ['#237a4b', '#e0a526', '#1e2140', '#d9534f', '#5fa37a', '#7a5fa3']
const slice = computed(() => 360 / props.candidates.length)   // degrees per place
const winnerIndex = computed(() => props.candidates.findIndex(c => c.id === props.winnerId))
 
// One coloured slice per place, starting at the top and going clockwise
const background = computed(() =>
  'conic-gradient(' +
  props.candidates.map((c, i) => `${COLOURS[i % COLOURS.length]} ${i * slice.value}deg ${(i + 1) * slice.value}deg`).join(', ') +
  ')'
)
 
const rotation = ref(0)
const stopped = ref(false)
 
onMounted(() => {
  // Land somewhere random INSIDE the winner's slice (not always dead centre), so it looks like a real spin
  const wobble = (Math.random() - 0.5) * slice.value * 0.6
  const target = winnerIndex.value * slice.value + slice.value / 2 + wobble
  // 6 full turns, then stop with that point under the ▼ pointer at the top
  setTimeout(() => { rotation.value = 6 * 360 - target }, 150)
})
 
function finish() {
  stopped.value = true
  setTimeout(() => emit('done'), 1200)   // pause on the result so everyone can see it
}
</script>
 
<template>
  <div class="mx-auto w-full max-w-sm">
    <div class="relative mx-auto aspect-square w-72 sm:w-80" data-testid="spin-wheel">
      <!-- Pointer -->
      <div class="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-3 text-4xl text-ink drop-shadow">▼</div>
 
      <!-- The wheel -->
      <div class="relative h-full w-full rounded-full border-8 border-white shadow-xl"
           :style="{ background, transform: `rotate(${rotation}deg)`, transition: 'transform 5s cubic-bezier(0.15, 0.85, 0.2, 1)' }"
           @transitionend="finish">
        <!-- A number in the middle of each slice -->
        <span v-for="(c, i) in candidates" :key="c.id"
              class="absolute left-1/2 top-1/2 flex h-9 w-9 -ml-[18px] -mt-[18px] items-center justify-center rounded-full bg-white/90 text-sm font-extrabold text-ink"
              :style="{ transform: `rotate(${i * slice + slice / 2}deg) translateY(-96px) rotate(-${i * slice + slice / 2}deg)` }">
          {{ i + 1 }}
        </span>
      </div>
 
      <!-- Hub in the centre -->
      <div class="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-ink shadow"></div>
    </div>
 
    <!-- Legend: full names, never clamped. The winner lights up when the wheel stops. -->
    <ol class="mt-6 space-y-2">
      <li v-for="(c, i) in candidates" :key="c.id"
          class="flex items-center gap-3 rounded-xl px-3 py-2 transition"
          :class="stopped && i === winnerIndex ? 'bg-brand-light font-bold ring-2 ring-brand scale-105' : 'bg-white'">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              :style="{ background: COLOURS[i % COLOURS.length] }">{{ i + 1 }}</span>
        <span class="text-sm">{{ c.name }}</span>
        <span v-if="stopped && i === winnerIndex" class="ml-auto text-sm">🎉</span>
      </li>
    </ol>
  </div>
</template>
