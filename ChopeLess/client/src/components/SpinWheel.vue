<!-- Spin wheel for ties. Lands on the winner the server already picked. Owner: M3 -->
<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  candidates: { type: Array, required: true },  // [{ id, name }]
  winnerId: { type: String, required: true }
})
const emit = defineEmits(['done'])

const COLOURS = ['#237a4b', '#e0a526', '#1e2140', '#5fa37a', '#c0841a', '#4a5068']
const slice = computed(() => 360 / props.candidates.length)  // degrees per place

// One coloured slice per place, starting at the top and going clockwise
const background = computed(() =>
  'conic-gradient(' +
  props.candidates.map((c, i) => `${COLOURS[i % COLOURS.length]} ${i * slice.value}deg ${(i + 1) * slice.value}deg`).join(', ') +
  ')'
)

const rotation = ref(0)
onMounted(() => {
  const i = props.candidates.findIndex(c => c.id === props.winnerId)
  const centre = i * slice.value + slice.value / 2   // where the winner's slice sits, in degrees
  // Spin 5 full turns, then stop with the winner's slice under the ▼ pointer at the top
  setTimeout(() => { rotation.value = 5 * 360 - centre }, 100)
})
</script>

<template>
  <div class="relative mx-auto h-64 w-64" data-testid="spin-wheel">
    <div class="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-2 text-3xl text-ink">▼</div>
    <div class="relative h-full w-full rounded-full border-4 border-white shadow-lg"
         :style="{ background, transform: `rotate(${rotation}deg)`, transition: 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)' }"
         @transitionend="emit('done')">
      <span v-for="(c, i) in candidates" :key="c.id"
            class="absolute left-1/2 top-1/2 -ml-14 -mt-2 w-28 text-center text-xs font-bold text-white"
            :style="{ transform: `rotate(${i * slice + slice / 2}deg) translateY(-80px)` }">
        {{ c.name }}
      </span>
    </div>
  </div>
</template>
