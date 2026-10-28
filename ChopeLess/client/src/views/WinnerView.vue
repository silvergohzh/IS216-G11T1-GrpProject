<!-- Winner screen: capsule reveal + confetti + walking route. Owner: M3 (page), M2 (route map)
     Flow: tie? -> GachaTie machine picks (the server already chose) -> capsule pops open -> winner card
     Confetti: canvas-confetti by Kiril Vatev (MIT), https://github.com/catdad/canvas-confetti -->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import confetti from "canvas-confetti";
import { useSessionStore } from "../stores/session";
import { api } from "../lib/api";
import PlaceCard from "../components/PlaceCard.vue";
import MapView from "../components/MapView.vue";
import GachaTie from "../components/GachaTie.vue";
import { sfx } from "../lib/sfx";

const route = useRoute();
const store = useSessionStore();
onMounted(() => store.watch(route.params.code));
onUnmounted(() => { store.stop(); clearTimeout(autoOpen); });

const winner = computed(() => store.session?.winner);
const tie = computed(() => store.session?.tieBreak); // set by the server when there was a tie
const revealed = ref(false); // true once the gacha machine has shown the tie winner
const from = computed(() => store.session?.meetingPoint);
const memberCount = computed(() => Object.keys(store.session?.members || {}).length);

// ---------- capsule reveal ----------
// 'closed' (wobbling capsule) -> 'popping' (halves fly off) -> 'open' (winner card + confetti)
const capsule = ref("closed");
let autoOpen = null;
const COLOURS = ["#ffd23f", "#ff7a45", "#7bc96f", "#ffffff", "#8fd3ff"];

function celebrate() {
  sfx.confetti();   // "pshh" at the same time as the confetti
  sfx.fanfare();    // little victory tune
  const base = { colors: COLOURS, disableForReducedMotion: true, zIndex: 2000 };
  confetti({ ...base, particleCount: 120, spread: 90, startVelocity: 45, origin: { y: 0.4 } });
  setTimeout(() => {
    confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
  }, 250);
}
function pop() {
  if (capsule.value !== "closed") return;
  capsule.value = "popping";
  sfx.pop();
  setTimeout(() => { capsule.value = "open"; celebrate(); }, 450);

}

// Start the reveal when we have a winner (straight away, or after the tie machine finishes)
const readyToReveal = computed(() => !!winner.value && (!tie.value || revealed.value));
watch(readyToReveal, ready => {
  if (ready) autoOpen = setTimeout(pop, 1200);   // pops by itself; tapping just skips the wait
}, { immediate: true });

// Opens Google Maps with walking directions (from the meeting point if the host set one)
const directionsUrl = computed(() => {
  const w = winner.value;
  if (!w) return "#";
  let url = `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}&travelmode=walking`;
  if (from.value) url += `&origin=${from.value.lat},${from.value.lng}`;
  return url;
});

// Walking route from the server (OSRM). Shows a straight line until it arrives, or if the request fails.
const path = ref([]);
watch(
  () => winner.value?.id,
  async (id) => {
    if (!id || !from.value) return;
    path.value = [
      [from.value.lat, from.value.lng],
      [winner.value.lat, winner.value.lng],
    ];
    try {
      const data = await api(`/shortlist/${route.params.code}/route`);
      if (data.route.length) path.value = data.route;
    } catch {
      /* keep the straight line */
    }
  },
  { immediate: true },
);
</script>

<template>
  <!-- 1. Tie: the capsule machine -->
  <div v-if="tie && !revealed" class="text-center">
    <span class="rounded-full bg-ink px-4 py-1 text-sm font-black tracking-widest text-accent">TIE BREAK · GACHA TIME</span>
    <h1 class="page-title mt-3">It's a tie!</h1>
    <p class="mb-4 font-extrabold">{{ tie.candidates.length }} places got the same votes. The machine picks one.</p>
    <GachaTie :candidates="tie.candidates" :winner-id="tie.winnerId" @done="revealed = true" />
    <p class="mt-3 text-sm font-bold">The server already picked fairly. The machine just shows it.</p>
  </div>

  <!-- 2. Winner -->
  <div v-else-if="winner" class="mx-auto flex max-w-xl flex-col gap-4">
    <div class="text-center">
      <p class="font-black tracking-widest">{{ capsule === 'open' ? 'STAGE CLEAR' : 'TAP THE CAPSULE' }}</p>
      <h1 class="text-6xl leading-none text-white [-webkit-text-stroke:3px_#17213b] [text-shadow:0_6px_0_#17213b]">
        {{ capsule === 'open' ? "Chope'd!" : 'Your pick is…' }}
      </h1>
    </div>

    <!-- closed capsule -->
    <div v-if="capsule !== 'open'" class="relative grid h-72 place-items-center">
      <button type="button" aria-label="Open the capsule" class="relative h-48 w-48"
              :class="{ 'capsule-wobble': capsule === 'closed' }" @click="pop">
        <span class="absolute left-0 top-0 h-24 w-48 rounded-t-full border-[6px] border-ink bg-accent"
              :class="{ 'capsule-lid': capsule === 'popping' }" aria-hidden="true"></span>
        <span class="absolute bottom-0 left-0 h-24 w-48 rounded-b-full border-[6px] border-ink bg-white"
              :class="{ 'capsule-base': capsule === 'popping' }" aria-hidden="true"></span>
      </button>
    </div>

    <!-- the prize -->
    <template v-else>
      <div class="capsule-prize card flex flex-col gap-3" role="status">
        <p class="text-xs font-black tracking-widest">YOU PULLED</p>
        <h2 class="text-4xl leading-tight text-brand" data-testid="winner-name">{{ winner.name }}</h2>
        <PlaceCard :place="winner" />
        <p v-if="memberCount" class="font-extrabold">{{ memberCount }} kakis voted · finishing earns Makan Points (up to 3 sessions a day,
          <RouterLink to="/points" class="underline">see points</RouterLink>)</p>
      </div>

      <div class="flex flex-wrap gap-3">
        <a :href="directionsUrl" target="_blank" rel="noopener" class="btn-primary font-display text-xl font-normal">Get walking directions</a>
        <!-- M6: group pre-order. Everyone in this session is added to the order automatically.
             Not pre-ordering? Skip it: the walking directions are right here. -->
        <RouterLink v-if="!String(winner.id).startsWith('gem-')" :to="`/orders?session=${route.params.code}`" class="btn" data-testid="group-preorder">Pre-order as a group</RouterLink>
        <RouterLink to="/sessions" class="btn">Start another session</RouterLink>
      </div>
      <div>
        <MapView
          :center="[winner.lat, winner.lng]"
          :markers="[
            { lat: winner.lat, lng: winner.lng, label: winner.name, color: '#ffd23f', radius: 12 },
            ...(from ? [{ ...from, label: 'Meeting point', color: '#17213b' }] : []),
          ]"
          :route="path"
        />
      </div>
    </template>
  </div>

  <!-- 3. Voting finished with no winner (every place was vetoed) -->
  <div v-else-if="store.session?.status === 'done'" class="card mx-auto max-w-xl text-center">
    <p class="mb-3 font-display text-3xl">No winner this time</p>
    <p class="mb-4">Every place got vetoed. Start a new session to try again.</p>
    <RouterLink to="/sessions" class="btn-primary">Start a new session</RouterLink>
  </div>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>
  <p v-else>Loading…</p>
</template>

<style scoped>
@keyframes wobble { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-10deg) } 40% { transform: rotate(10deg) } 60% { transform: rotate(-6deg) scale(1.05) } 80% { transform: rotate(6deg) } }
@keyframes lid { to { transform: translate(-80px, -120px) rotate(-50deg); opacity: 0 } }
@keyframes base { to { transform: translate(80px, 120px) rotate(40deg); opacity: 0 } }
@keyframes prize { 0% { transform: translateY(60px) scale(.3); opacity: 0 } 65% { transform: translateY(-6px) scale(1.05); opacity: 1 } 100% { transform: none } }
.capsule-wobble { animation: wobble .9s ease-in-out infinite }
.capsule-lid { animation: lid .45s ease-out forwards }
.capsule-base { animation: base .45s ease-out forwards }
.capsule-prize { animation: prize .7s cubic-bezier(.2,.9,.3,1.2) both }
</style>
