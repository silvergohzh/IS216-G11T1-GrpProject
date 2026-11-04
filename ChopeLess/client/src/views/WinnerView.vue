<!-- Winner screen: capsule reveal + confetti + walking route + live QueueLess -->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { doc, onSnapshot } from "firebase/firestore";
import confetti from "canvas-confetti";
import { useAuthStore } from "../stores/auth";

import { useSessionStore } from "../stores/session";
import { startRevote } from "../services/sessions";
import { api } from "../lib/api";
import { db } from "../lib/firebase";
import { sfx } from "../lib/sfx";

import PlaceCard from "../components/PlaceCard.vue";
import MapView from "../components/MapView.vue";
import GachaTie from "../components/GachaTie.vue";
import GemMenu from "../components/GemMenu.vue";

const route = useRoute();
const router = useRouter();
const store = useSessionStore();
const auth = useAuthStore();

const winner = computed(() => store.session?.winner);
const tie = computed(() => store.session?.tieBreak);
const revealed = ref(false);
const from = computed(() => store.session?.meetingPoint);

const memberCount = computed(
  () => Object.keys(store.session?.members || {}).length,
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
            ...snap.data(),
          };

          queueError.value = "";
        } else {
          queueInfo.value = null;
          queueError.value = "Queue information is not available.";
        }
      },

      () => {
        queueLoading.value = false;
        queueInfo.value = null;
        queueError.value = "Could not load queue information.";
      },
    );

    stopQueue = unsubscribe;

    onCleanup(() => {
      unsubscribe();

      if (stopQueue === unsubscribe) {
        stopQueue = null;
      }
    });
  },
  { immediate: true },
);

// =====================================================
// [JANANIJ] END
// =====================================================
const revoteBusy = ref(false);
const revoteError = ref("");

const currentWaitMins = computed(() => {
  const value = queueInfo.value?.latest?.waitMins;

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const minutes = Number(value);

  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
});

const canStartRevote = computed(
  () =>
    store.session?.status === "done" &&
    store.session?.hostUid === auth.user?.uid &&
    !!winner.value &&
    currentWaitMins.value !== null &&
    !store.session?.orderingStarted &&
    !store.session?.revoteCompleted &&
    !store.session?.revoteStartedAt,
);

async function requestRevote() {
  if (revoteBusy.value || !canStartRevote.value) return;

  const confirmed = window.confirm(
    `The estimated queue at ${winner.value.name} is ${currentWaitMins.value} minutes.\n\n` +
      "Start another group vote for alternatives with shorter queues?",
  );

  if (!confirmed) return;

  revoteBusy.value = true;
  revoteError.value = "";

  try {
    await startRevote(route.params.code);

    await router.push(`/sessions/${route.params.code}/vote`);
  } catch (err) {
    revoteError.value =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      "Unable to start QueueLess re-voting.";
  } finally {
    revoteBusy.value = false;
  }
}

// All group members must follow the same session state.
watch(
  () => store.session?.status,
  (status) => {
    if (status === "revoting") {
      router.push(`/sessions/${route.params.code}/vote`);
    }
  },
  { immediate: true },
);

// [M6] START: Group pre-order, started by the host
// Only the host starts the group pre-order. The server saves the new order on the session
// (session.preorder), so everyone still on this page is taken to that same order automatically.
const isHost = computed(() => store.session?.hostUid === auth.user?.uid);
const hostName = computed(
  () => store.session?.members?.[store.session?.hostUid]?.name || "The host",
);
const groupOrder = computed(() => store.session?.preorder || null);

watch(
  () => store.session,
  (now, before) => {
    const orderId = now?.preorder?.orderId;
    // Only when the order starts while I'm on this page (not when I open the page later),
    // and not for the host, who is already on the order page
    if (before && orderId && orderId !== before.preorder?.orderId && !isHost.value) {
      router.push(`/orders/${orderId}`);
    }
  },
);
// [M6] END

// Hidden Gems are community listings: the menu can be viewed, but they can't be pre-ordered
const isGem = computed(
  () =>
    !!queueInfo.value?.fromGem ||
    String(winner.value?.id || "").startsWith("gem-"),
);
// =====================================================
// Capsule reveal + sound effects + confetti
// =====================================================

const capsule = ref("closed");

let autoOpen = null;
let popTimer = null;
let confettiTimer = null;

const COLOURS = ["#ffd23f", "#ff7a45", "#7bc96f", "#ffffff", "#8fd3ff"];

function celebrate() {
  // Preserve sound effects from main
  sfx.confetti();
  sfx.fanfare();

  const base = {
    colors: COLOURS,
    disableForReducedMotion: true,
    zIndex: 2000,
  };

  confetti({
    ...base,
    particleCount: 120,
    spread: 90,
    startVelocity: 45,
    origin: { y: 0.4 },
  });

  clearTimeout(confettiTimer);

  confettiTimer = setTimeout(() => {
    confetti({
      ...base,
      particleCount: 60,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
    });

    confetti({
      ...base,
      particleCount: 60,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
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
const readyToReveal = computed(
  () => !!winner.value && (!tie.value || revealed.value),
);

watch(
  readyToReveal,
  (ready) => {
    clearTimeout(autoOpen);

    if (ready) {
      autoOpen = setTimeout(pop, 1200);
    }
  },
  { immediate: true },
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
      [winner.value.lat, winner.value.lng],
    ];

    try {
      const data = await api(`/shortlist/${route.params.code}/route`);

      if (!cancelled && data.route?.length) {
        path.value = data.route;
      }
    } catch {
      // Keep the straight line if the route fails
    }
  },
  { immediate: true },
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
      {{ tie.candidates.length }} places got the same votes. The machine picks
      one.
    </p>

    <GachaTie
      :candidates="tie.candidates"
      :winner-id="tie.winnerId"
      @done="revealed = true"
    />

    <p class="mt-3 text-sm font-bold">
      The server already picked fairly. The machine just shows it.
    </p>
  </div>

  <!-- 2. Winner -->
  <div v-else-if="winner" class="mx-auto flex max-w-xl flex-col gap-4">
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
      <div class="capsule-prize card flex flex-col gap-3" role="status">
        <p class="text-xs font-black tracking-widest">YOU PULLED</p>

        <h2 class="text-4xl leading-tight text-brand" data-testid="winner-name">
          {{ winner.name }}
        </h2>

        <PlaceCard :place="winner" />

        <p v-if="memberCount" class="font-extrabold">
          {{ memberCount }} kakis voted · finishing earns Makan Points (up to 3
          sessions a day,
          <RouterLink to="/points" class="underline"> see points </RouterLink>)
        </p>
      </div>

      <!--  Walking route map: moved up, right under the winner, so nobody has to scroll for it -->
      <div>
        <MapView
          :center="[winner.lat, winner.lng]"
          :markers="[
            {
              lat: winner.lat,
              lng: winner.lng,
              label: winner.name,
              icon: 'finish',
            },
            ...(from
              ? [
                  {
                    ...from,
                    label: 'Meeting point',
                    icon: 'start',
                  },
                ]
              : []),
          ]"
          :route="path"
        />
      </div>

      <!-- =================================================
           [JANANIJ] START: Winner to QueueLess integration
           ================================================= -->

      <div class="card flex flex-col gap-3" data-testid="winner-queueless">
        <h3 class="font-display text-2xl">QueueLess at {{ winner.name }}</h3>

        <p class="text-sm font-bold">
          Check the estimated queue before heading there!
        </p>

        <!-- Loading -->
        <p v-if="queueLoading" class="text-sm">Loading queue information...</p>

        <!-- Error -->
        <p v-else-if="queueError" class="text-sm">
          {{ queueError }}
        </p>

        <!-- Queue information available -->
        <div v-else-if="queueInfo?.latest" class="flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3">
            <div
              class="rounded-2xl border-2 border-ink bg-white p-3 text-center"
            >
              <p class="font-display text-3xl">
                {{ queueInfo.latest.waitMins ?? "?" }}
              </p>

              <p class="text-sm font-bold">Minutes wait</p>
            </div>

            <div
              class="rounded-2xl border-2 border-ink bg-white p-3 text-center"
            >
              <p class="font-display text-3xl">
                {{ queueInfo.latest.seatOccupancy ?? "?" }}%
              </p>

              <p class="text-sm font-bold">Seats occupied</p>
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
            Based on the latest QueueLess report. Updates automatically when a
            new report is saved.
          </p>
        </div>

        <!-- No report -->
        <p v-else class="text-sm">No queue estimate available yet.</p>

        <RouterLink :to="`/places/${winner.id}`" class="btn">
          View QueueLess details
        </RouterLink>
      </div>

      <!-- [JANANIJ] END -->

      <div
        v-if="canStartRevote"
        class="card flex flex-col gap-3"
        data-testid="queueless-revote"
      >
        <h3 class="font-display text-2xl">Queue too long?</h3>

        <p class="text-sm font-bold">
          The current estimated wait at {{ winner.name }} is
          {{ currentWaitMins }} minutes.
        </p>

        <p class="text-sm">
          Your group can vote again on alternative places with shorter reported
          queues before ordering.
        </p>

        <button
          type="button"
          class="btn-primary"
          :disabled="revoteBusy"
          data-testid="start-revote"
          @click="requestRevote"
        >
          {{ revoteBusy ? "Starting re-vote..." : "Re-vote as a group" }}
        </button>
      </div>

      <p v-if="revoteError" class="error" role="alert">
        {{ revoteError }}
      </p>

      <!-- [JANANIJ] END -->

      <!-- [M3] Hidden Gem: community menu (view only), in the same card style as the QueueLess card -->
      <div
        v-if="queueInfo?.fromGem && queueInfo.gemId"
        class="card flex flex-col gap-3"
        data-testid="winner-gem-menu"
      >
        <h3 class="font-display text-2xl">Menu at {{ winner.name }}</h3>
        <GemMenu :gem-id="queueInfo.gemId" preorder-note class="!border-0 !p-0" />
      </div>

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

        <!-- M6: Group pre-order. The host starts it, and everyone else is taken to it automatically -->
        <template v-if="!queueLoading && !isGem">
          <RouterLink
            v-if="groupOrder"
            :to="`/orders/${groupOrder.orderId}`"
            class="btn"
            data-testid="group-preorder"
          >
            Open the group order ({{ groupOrder.placeName }})
          </RouterLink>
          <RouterLink
            v-else-if="isHost"
            :to="`/orders?session=${route.params.code}`"
            class="btn"
            data-testid="group-preorder"
          >
            Pre-order as a group
          </RouterLink>
          <p v-else class="self-center text-sm text-slate-600" data-testid="preorder-waiting">
            {{ hostName }} can start a group pre-order. When they do, you'll be taken to it automatically.
          </p>
        </template>

        <RouterLink to="/sessions" class="btn">
          Start another session
        </RouterLink>
      </div>

    </template>
  </div>

  <!-- 3. No winner -->
  <div
    v-else-if="store.session?.status === 'done'"
    class="card mx-auto max-w-xl text-center"
  >
    <p class="mb-3 font-display text-3xl">No winner this time</p>

    <p class="mb-4">
      Every place got vetoed. Start a new session to try again.
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
  0%,
  100% {
    transform: rotate(0);
  }
  20% {
    transform: rotate(-10deg);
  }
  40% {
    transform: rotate(10deg);
  }
  60% {
    transform: rotate(-6deg) scale(1.05);
  }
  80% {
    transform: rotate(6deg);
  }
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
    transform: translateY(60px) scale(0.3);
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
  animation: wobble 0.9s ease-in-out infinite;
}

.capsule-lid {
  animation: lid 0.45s ease-out forwards;
}

.capsule-base {
  animation: base 0.45s ease-out forwards;
}

.capsule-prize {
  animation: prize 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
</style>
