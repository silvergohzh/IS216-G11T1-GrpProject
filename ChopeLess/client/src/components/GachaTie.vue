<!-- Tie break as a capsule-toy machine ("Chope-Pon"). Owner: M3
     The SERVER already picked the winner at random (session.tieBreak.winnerId).
     This only animates it, so every phone shows the same result:
       idle -> turning (machine shakes) -> dropped (capsule falls out) -> opening -> open -> emit('done')
     It runs by itself; tapping the crank or the capsule just skips ahead. -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sfx } from '../lib/sfx'

const props = defineProps({
  candidates: { type: Array, required: true },  // [{ id, name }], max 6 (the server caps it)
  winnerId: { type: String, required: true }
})
const emit = defineEmits(['done'])

const COLOURS = ['#ffd23f', '#7bc96f', '#ff7a45', '#8fd3ff', '#c7b8ff', '#ffffff']
const winnerIndex = computed(() => props.candidates.findIndex(c => c.id === props.winnerId))
const winner = computed(() => props.candidates[winnerIndex.value])
const winnerColour = computed(() => COLOURS[winnerIndex.value % COLOURS.length])

// Capsules inside the dome: each tied place appears twice so the dome looks full
const SPOTS = [[18, 52], [42, 66], [64, 48], [28, 26], [54, 16], [72, 70]]
const capsules = computed(() => SPOTS.map(([x, y], i) => {
  const c = i % props.candidates.length
  return { key: i, n: c + 1, colour: COLOURS[c % COLOURS.length], left: x + '%', top: y + '%' }
}))

const phase = ref('idle')
const timers = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))

function turn() {
  if (phase.value !== 'idle') return
  phase.value = 'turning'
  sfx.crank()
  later(() => { phase.value = 'dropped'; later(open, 1100) }, 1300)
}
function open() {
  if (phase.value !== 'dropped') return
  phase.value = 'opening'
  sfx.pop()
  later(() => { phase.value = 'open'; later(() => emit('done'), 1600) }, 450)
}

onMounted(() => later(turn, 700))
onUnmounted(() => timers.forEach(clearTimeout))

const hint = computed(() => ({
  idle: 'Turn the crank!',
  turning: 'Shaking it up…',
  dropped: 'A capsule dropped! Tap to open.',
  opening: 'Opening…',
  open: `${winner.value?.name} it is!`
})[phase.value])
</script>

<template>
  <div class="mx-auto flex w-full max-w-sm flex-col items-center gap-3 text-center" data-testid="spin-wheel">
    <p class="min-h-6 font-extrabold" aria-live="polite">{{ hint }}</p>

    <div class="relative h-[430px] w-[300px]">
      <!-- glass dome -->
      <div class="absolute left-1/2 top-0 z-20 h-[236px] w-[236px] -translate-x-1/2 overflow-hidden rounded-full border-[6px] border-ink bg-[#dff4ff]"
           :class="{ 'gacha-shake': phase === 'turning' }" aria-hidden="true">
        <span class="absolute left-8 top-7 h-5 w-12 -rotate-[30deg] rounded-full bg-white/90"></span>
        <span v-for="c in capsules" :key="c.key"
              class="absolute grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-full border-4 border-ink font-display text-lg"
              :class="{ 'gacha-tumble': phase === 'turning' }"
              :style="{ left: c.left, top: c.top, background: `linear-gradient(180deg, ${c.colour} 50%, #fff 50%)` }">{{ c.n }}</span>
      </div>

      <!-- machine body -->
      <div class="absolute left-1/2 top-[214px] z-10 h-[200px] w-[250px] -translate-x-1/2 rounded-[26px_26px_18px_18px] border-[6px] border-ink bg-coral shadow-[0_8px_0_#17213b]">
        <span class="absolute left-5 top-5 font-display text-xl text-white [-webkit-text-stroke:1.5px_#17213b]">CHOPE-PON</span>
        <button type="button" :disabled="phase !== 'idle'" aria-label="Turn the crank"
                class="absolute right-5 top-6 h-[92px] w-[92px] rounded-full border-[5px] border-ink bg-accent shadow-[0_5px_0_#17213b]"
                @click="turn">
          <span class="absolute inset-0" :class="{ 'gacha-crank': phase === 'turning' }" aria-hidden="true">
            <span class="absolute bottom-2 left-1/2 top-2 w-[18px] -translate-x-1/2 rounded-lg border-[3px] border-ink bg-white"></span>
            <span class="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"></span>
          </span>
        </button>
        <div class="absolute bottom-4 left-5 h-[74px] w-[120px] rounded-2xl border-4 border-[#0e1528] bg-ink"></div>
      </div>

      <!-- the capsule that falls out -->
      <button v-if="phase === 'dropped' || phase === 'opening'" type="button" aria-label="Open the capsule"
              class="absolute left-[113px] top-[334px] z-30 h-[86px] w-[86px] -translate-x-1/2"
              :class="{ 'gacha-drop': phase === 'dropped' }" @click="open">
        <span class="absolute left-0 top-0 h-[43px] w-[86px] rounded-t-full border-4 border-ink"
              :class="{ 'gacha-lid': phase === 'opening' }" :style="{ background: winnerColour }" aria-hidden="true"></span>
        <span class="absolute bottom-0 left-0 h-[43px] w-[86px] rounded-b-full border-4 border-ink bg-white"
              :class="{ 'gacha-base': phase === 'opening' }" aria-hidden="true"></span>
      </button>

      <!-- result -->
      <div v-if="phase === 'open'" role="status"
           class="gacha-reveal card absolute inset-x-0 top-[120px] z-40 flex flex-col gap-2">
        <span class="self-center rounded-full border-[3px] border-ink px-3 py-1 text-xs font-black tracking-widest"
              :style="{ background: winnerColour }">CAPSULE {{ winnerIndex + 1 }}</span>
        <p class="font-display text-3xl leading-tight">{{ winner?.name }}</p>
      </div>
    </div>

    <!-- legend: full names, the numbers match the capsules -->
    <ol class="flex w-full flex-col gap-2 text-left">
      <li v-for="(c, i) in candidates" :key="c.id"
          class="flex items-center gap-3 rounded-xl border-[3px] border-ink px-3 py-2 font-black transition"
          :class="phase === 'open' && i === winnerIndex ? 'scale-105 bg-accent' : 'bg-white'">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink text-xs"
              :style="{ background: `linear-gradient(180deg, ${COLOURS[i % COLOURS.length]} 50%, #fff 50%)` }">{{ i + 1 }}</span>
        {{ c.name }}
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* Tailwind's -translate-x-1/2 uses the separate `translate` property, so these keyframes only rotate/move on top of it */
@keyframes shake { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-4deg) } 75% { transform: rotate(4deg) } }
@keyframes tumble { 0% { transform: translate(0,0) rotate(0) } 33% { transform: translate(10px,-18px) rotate(120deg) } 66% { transform: translate(-8px,-6px) rotate(240deg) } 100% { transform: translate(0,0) rotate(360deg) } }
@keyframes crank { to { transform: rotate(720deg) } }
@keyframes drop { 0% { transform: translateY(-90px) scale(.6); opacity: 0 } 55% { transform: translateY(8px) scale(1.05); opacity: 1 } 75% { transform: translateY(-10px) } 100% { transform: translateY(0) } }
@keyframes wobble { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-8deg) } 75% { transform: rotate(8deg) } }
@keyframes lid { to { transform: translate(-46px,-70px) rotate(-38deg); opacity: 0 } }
@keyframes base { to { transform: translate(40px,40px) rotate(24deg); opacity: 0 } }
@keyframes reveal { 0% { transform: scale(.3); opacity: 0 } 70% { transform: scale(1.06); opacity: 1 } 100% { transform: scale(1) } }
.gacha-shake { animation: shake .4s ease-in-out 3 }
.gacha-tumble { animation: tumble .6s ease-in-out 2 }
.gacha-crank { animation: crank 1.2s cubic-bezier(.4,0,.2,1) }
.gacha-drop { animation: drop .7s cubic-bezier(.3,.8,.3,1.2) both, wobble 1s ease-in-out .8s infinite }
.gacha-lid { animation: lid .45s ease-out forwards }
.gacha-base { animation: base .45s ease-out forwards }
.gacha-reveal { animation: reveal .55s cubic-bezier(.2,.9,.3,1.2) both }
</style>