
<!-- Winner screen: capsule reveal + confetti + walking route + live QueueLess -->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { doc, onSnapshot } from "firebase/firestore";
import confetti from "canvas-confetti";

import { useSessionStore } from "../stores/session";
import { api } from "../lib/api";
import { db } from "../lib/firebase";
import { sfx } from "../lib/sfx";

import PlaceCard from "../components/PlaceCard.vue";
import MapView from "../components/MapView.vue";
import GachaTie from "../components/GachaTie.vue";

const route = useRoute();
const store = useSessionStore();

const winner = computed(() => store.session?.winner);
const tie = computed(() => store.session?.tieBreak);
const revealed = ref(false);
const from = computed(() => store.session?.meetingPoint);

const memberCount = computed(() =>
  Object.keys(store.session?.members || {}).length
);

onMounted(() => store.watch(route.params.code));

// =====================================================
// [JANANIJ] START: Live QueueLess information
// =====================================================

const queueInfo = ref(null);
const queueError = ref("");
const queueLoading = ref(false);

let stopQueue = null;

watch(
  () => winner.value?.id,
  (id, oldId, onCleanup) => {
    queueInfo.value = null;
    queueError.value = "";
    queueLoading.value = !!id;

    if (!id) return;

    const unsubscribe = onSnapshot(
      doc(db, "places", String(id)),

      (snap) => {
        queueLoading.value = false;

        if (snap.exists()) {
          queueInfo.value = {
            id: snap.id,
            ...snap.data()
          };

          queueError.value = "";
        } else {
          queueInfo.value = null;
          queueError.value =
            "Queue information is not available.";
        }
      },

      () => {
        queueLoading.value = false;
        queueInfo.value = null;
        queueError.value =
          "Could not load queue information.";
      }
    );

    stopQueue = unsubscribe;

    onCleanup(() => {
      unsubscribe();

      if (stopQueue === unsubscribe) {
        stopQueue = null;
      }
    });
  },
  { immediate: true }
);

// =====================================================
// [JANANIJ] END
// =====================================================

// =====================================================
// Capsule reveal + sound effects + confetti
// =====================================================

const capsule = ref("closed");

let autoOpen = null;
let popTimer = null;
let confettiTimer = null;

const COLOURS = [
  "#ffd23f",
  "#ff7a45",
  "#7bc96f",
  "#ffffff",
  "#8fd3ff"
];

function celebrate() {
  // Preserve sound effects from main
  sfx.confetti();
  sfx.fanfare();

  const base = {
    colors: COLOURS,
    disableForReducedMotion: true,
    zIndex: 2000
  };

  confetti({
    ...base,
    particleCount: 120,
    spread: 90,
    startVelocity: 45,
    origin: { y: 0.4 }
  });

  clearTimeout(confettiTimer);

  confettiTimer = setTimeout(() => {
    confetti({
      ...base,
      particleCount: 60,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 }
    });

    confetti({
      ...base,
      particleCount: 60,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 }
    });
  }, 250);
}

function pop() {
  if (capsule.value !== "closed") return;

  capsule.value = "popping";

  // Prevent the automatic timer from triggering again
  clearTimeout(autoOpen);

  // Preserve capsule sound from main
  sfx.pop();

  clearTimeout(popTimer);

  popTimer = setTimeout(() => {
    capsule.value = "open";
    celebrate();
  }, 450);
}

// Start reveal when the winner is ready
const readyToReveal = computed(() =>
  !!winner.value && (!tie.value || revealed.value)
);

watch(
  readyToReveal,
  (ready) => {
    clearTimeout(autoOpen);

    if (ready) {
      autoOpen = setTimeout(pop, 1200);
    }
  },
  { immediate: true }
);

// =====================================================
// Walking directions
// =====================================================

const directionsUrl = computed(() => {
  const w = winner.value;

  if (!w) return "#";

  let url =
    `https://www.google.com/maps/dir/?api=1` +
    `&destination=${w.lat},${w.lng}` +
    `&travelmode=walking`;

  if (from.value) {
    url += `&origin=${from.value.lat},${from.value.lng}`;
  }

  return url;
});

// =====================================================
// Walking route from server
// =====================================================

const path = ref([]);

watch(
  () => winner.value?.id,
  async (id, oldId, onCleanup) => {
    let cancelled = false;

    onCleanup(() => {
      cancelled = true;
    });

    path.value = [];

    if (!id || !from.value) return;

    path.value = [
      [from.value.lat, from.value.lng],
      [winner.value.lat, winner.value.lng]
    ];

    try {
      const data = await api(
        `/shortlist/${route.params.code}/route`
      );

      if (!cancelled && data.route?.length) {
        path.value = data.route;
      }
    } catch {
      // Keep the straight line if the route fails
    }
  },
  { immediate: true }
);

// =====================================================
// Cleanup when leaving page
// =====================================================

onUnmounted(() => {
  store.stop();

  clearTimeout(autoOpen);
  clearTimeout(popTimer);
  clearTimeout(confettiTimer);

  if (stopQueue) {
    stopQueue();
    stopQueue = null;
  }
});
</script>

<template>
  <!-- 1. Tie: Gacha machine -->
  <div v-if="tie && !revealed" class="text-center">
    <span
      class="rounded-full bg-ink px-4 py-1 text-sm font-black tracking-widest text-accent"
    >
      TIE BREAK · GACHA TIME
    </span>

    <h1 class="page-title mt-3">It's a tie!</h1>

    <p class="mb-4 font-extrabold">
      {{ tie.candidates.length }} places got the same votes.
      The machine picks one.
    </p>

    <GachaTie
      :candidates="tie.candidates"
      :winner-id="tie.winnerId"
      @done="revealed = true"
    />

    <p class="mt-3 text-sm font-bold">
      The server already picked fairly.
      The machine just shows it.
    </p>
  </div>

  <!-- 2. Winner -->
  <div
    v-else-if="winner"
    class="mx-auto flex max-w-xl flex-col gap-4"
  >
    <div class="text-center">
      <p class="font-black tracking-widest">
        {{ capsule === "open" ? "STAGE CLEAR" : "TAP THE CAPSULE" }}
      </p>

      <h1
        class="text-6xl leading-none text-white [-webkit-text-stroke:3px_#17213b] [text-shadow:0_6px_0_#17213b]"
      >
        {{ capsule === "open" ? "Chope'd!" : "Your pick is…" }}
      </h1>
    </div>

    <!-- Closed capsule -->
    <div
      v-if="capsule !== 'open'"
      class="relative grid h-72 place-items-center"
    >
      <button
        type="button"
        aria-label="Open the capsule"
        class="relative h-48 w-48"
        :class="{ 'capsule-wobble': capsule === 'closed' }"
        @click="pop"
      >
        <span
          class="absolute left-0 top-0 h-24 w-48 rounded-t-full border-[6px] border-ink bg-accent"
          :class="{ 'capsule-lid': capsule === 'popping' }"
          aria-hidden="true"
        ></span>

        <span
          class="absolute bottom-0 left-0 h-24 w-48 rounded-b-full border-[6px] border-ink bg-white"
          :class="{ 'capsule-base': capsule === 'popping' }"
          aria-hidden="true"
        ></span>
      </button>
    </div>

    <!-- Winner prize -->
    <template v-else>
      <div
        class="capsule-prize card flex flex-col gap-3"
        role="status"
      >
        <p class="text-xs font-black tracking-widest">
          YOU PULLED
        </p>

        <h2
          class="text-4xl leading-tight text-brand"
          data-testid="winner-name"
        >
          {{ winner.name }}
        </h2>

        <PlaceCard :place="winner" />

        <p v-if="memberCount" class="font-extrabold">
          {{ memberCount }} kakis voted · finishing earns
          Makan Points (up to 3 sessions a day,
          <RouterLink to="/points" class="underline">
            see points
          </RouterLink>)
        </p>
      </div>

      <!-- =================================================
           [JANANIJ] START: Winner to QueueLess integration
           ================================================= -->

      <div
        class="card flex flex-col gap-3"
        data-testid="winner-queueless"
      >
        <h3 class="font-display text-2xl">
          QueueLess at {{ winner.name }}
        </h3>

        <p class="text-sm font-bold">
          Check the estimated queue before heading there!
        </p>

        <!-- Loading -->
        <p v-if="queueLoading" class="text-sm">
          Loading queue information...
        </p>

        <!-- Error -->
        <p v-else-if="queueError" class="text-sm">
          {{ queueError }}
        </p>

        <!-- Queue information available -->
        <div
          v-else-if="queueInfo?.latest"
          class="flex flex-col gap-3"
        >
          <div class="grid grid-cols-2 gap-3">
            <div
              class="rounded-2xl border-2 border-ink bg-white p-3 text-center"
            >
              <p class="font-display text-3xl">
                {{ queueInfo.latest.waitMins ?? "?" }}
              </p>

              <p class="text-sm font-bold">
                Minutes wait
              </p>
            </div>

            <div
              class="rounded-2xl border-2 border-ink bg-white p-3 text-center"
            >
              <p class="font-display text-3xl">
                {{ queueInfo.latest.seatOccupancy ?? "?" }}%
              </p>

              <p class="text-sm font-bold">
                Seats occupied
              </p>
            </div>
          </div>

          <p
            v-if="queueInfo.latest.peopleInQueue != null"
            class="text-sm font-bold"
          >
            {{ queueInfo.latest.peopleInQueue }}
            people currently estimated in the queue.
          </p>

          <p class="text-xs">
            Based on the latest QueueLess report.
            Updates automatically when a new report is saved.
          </p>
        </div>

        <!-- No report -->
        <p v-else class="text-sm">
          No queue estimate available yet.
        </p>

        <RouterLink
          :to="`/places/${winner.id}`"
          class="btn"
        >
          View QueueLess details
        </RouterLink>
      </div>

      <!-- [JANANIJ] END -->

      <!-- Existing winner actions -->
      <div class="flex flex-wrap gap-3">
        <a
          :href="directionsUrl"
          target="_blank"
          rel="noopener"
          class="btn-primary font-display text-xl font-normal"
        >
          Get walking directions
        </a>

        <!-- M6: Group pre-order -->
        <RouterLink
          v-if="!String(winner.id).startsWith('gem-')"
          :to="`/orders?session=${route.params.code}`"
          class="btn"
          data-testid="group-preorder"
        >
          Pre-order as a group
        </RouterLink>

        <RouterLink to="/sessions" class="btn">
          Start another session
        </RouterLink>
      </div>

      <!-- Walking route map -->
      <div>
        <MapView
          :center="[winner.lat, winner.lng]"
          :markers="[
            {
              lat: winner.lat,
              lng: winner.lng,
              label: winner.name,
              color: '#ffd23f',
              radius: 12
            },
            ...(from
              ? [{
                  ...from,
                  label: 'Meeting point',
                  color: '#17213b'
                }]
              : [])
          ]"
          :route="path"
        />
      </div>
    </template>
  </div>

  <!-- 3. No winner -->
  <div
    v-else-if="store.session?.status === 'done'"
    class="card mx-auto max-w-xl text-center"
  >
    <p class="mb-3 font-display text-3xl">
      No winner this time
    </p>

    <p class="mb-4">
      Every place got vetoed.
      Start a new session to try again.
    </p>

    <RouterLink to="/sessions" class="btn-primary">
      Start a new session
    </RouterLink>
  </div>

  <p v-else-if="store.error" class="error">
    {{ store.error }}
  </p>

  <p v-else>Loading…</p>
</template>

<style scoped>
@keyframes wobble {
  0%, 100% { transform: rotate(0); }
  20% { transform: rotate(-10deg); }
  40% { transform: rotate(10deg); }
  60% { transform: rotate(-6deg) scale(1.05); }
  80% { transform: rotate(6deg); }
}

@keyframes lid {
  to {
    transform: translate(-80px, -120px) rotate(-50deg);
    opacity: 0;
  }
}

@keyframes base {
  to {
    transform: translate(80px, 120px) rotate(40deg);
    opacity: 0;
  }
}

@keyframes prize {
  0% {
    transform: translateY(60px) scale(.3);
    opacity: 0;
  }
  65% {
    transform: translateY(-6px) scale(1.05);
    opacity: 1;
  }
  100% {
    transform: none;
  }
}

.capsule-wobble {
  animation: wobble .9s ease-in-out infinite;
}

.capsule-lid {
  animation: lid .45s ease-out forwards;
}

.capsule-base {
  animation: base .45s ease-out forwards;
}

.capsule-prize {
  animation: prize .7s cubic-bezier(.2,.9,.3,1.2) both;
}
</style>
