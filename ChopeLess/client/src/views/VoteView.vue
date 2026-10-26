<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import { useAuthStore } from "../stores/auth";
import {
  castVote,
  finishVoting,
  buyExtraSuperLike
} from "../services/sessions";
import { listHistory } from "../services/history";
import SwipeCard from "../components/SwipeCard.vue";

const route = useRoute();
const router = useRouter();
const store = useSessionStore();
const auth = useAuthStore();
const code = route.params.code;

const card = ref(null);
const busy = ref(false);
const buying = ref(false);
const error = ref("");
const purchaseMessage = ref("");
const votedHere = ref([]);
const pendingSpecial = ref(null);
const visits = ref({});

const places = computed(() => store.session?.shortlist || []);
const votes = computed(() => store.session?.votes || {});
const members = computed(() =>
  Object.entries(store.session?.members || {})
);
const myUid = computed(() => auth.user?.uid);

const notMember = computed(
  () => store.session && !store.session.members?.[myUid.value]
);

// =====================================================
// SUPER LIKES AND VETOES
// =====================================================

const superLikes = computed(
  () => store.session?.superLikes || {}
);

const vetoes = computed(
  () => store.session?.vetoes || {}
);

const extraSuperLikes = computed(
  () => store.session?.extraSuperLikes || {}
);

const myExtras = computed(
  () => extraSuperLikes.value[myUid.value] || {}
);

const purchasedExtrasLeft = computed(() =>
  Math.max(
    0,
    (myExtras.value.purchased || 0) -
      (myExtras.value.used || 0) -
      (myExtras.value.refunded || 0)
  )
);

const usedFreeSuper = computed(
  () => !!superLikes.value[myUid.value]
);

const freeSuperLeft = computed(
  () => (usedFreeSuper.value ? 0 : 1)
);

const totalSuperLikesLeft = computed(
  () => freeSuperLeft.value + purchasedExtrasLeft.value
);

const usedVeto = computed(
  () => !!vetoes.value[myUid.value]
);

const vetoedIds = computed(
  () => Object.values(vetoes.value)
);

const activePlaces = computed(() =>
  places.value.filter(
    place => !vetoedIds.value.includes(place.id)
  )
);

const current = computed(() =>
  activePlaces.value.find(
    place =>
      !votedHere.value.includes(place.id) &&
      votes.value[place.id]?.[myUid.value] === undefined
  )
);

const currentCard = computed(
  () =>
    current.value && {
      ...current.value,
      visits: visits.value[current.value.id] || 0
    }
);

const doneCount = computed(
  () =>
    activePlaces.value.filter(
      place =>
        votes.value[place.id]?.[myUid.value] !== undefined
    ).length
);

// =====================================================
// BUY EXTRA SUPER LIKE
// =====================================================

async function buySuperLike() {
    if (buying.value || busy.value || timeUp.value) return false;

  const confirmed = window.confirm(
    "You've used your free Super Like.\nUse 20 Makan Points to Super Like this place?"
  );

  if (!confirmed) return false;

  buying.value = true;
  error.value = "";
  purchaseMessage.value = "";

  try {
    await buyExtraSuperLike(code);

    purchaseMessage.value =
      "⭐ Super Like bought: 20 Makan Points used.";
    return true;
  } catch (err) {
    error.value =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      "Unable to purchase Super Like.";
    return false;
  } finally {
    buying.value = false;
  }
}

// =====================================================
// VOTING
// =====================================================

async function vote(yes) {
  if (busy.value || !current.value || timeUp.value) return;

  busy.value = true;
  error.value = "";
  purchaseMessage.value = "";

  const special = pendingSpecial.value;
  pendingSpecial.value = null;

  const placeId = current.value.id;

  votedHere.value.push(placeId);

  try {
    await castVote(code, placeId, yes, special);
  } catch (err) {
    votedHere.value = votedHere.value.filter(
      id => id !== placeId
    );

    error.value =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      "Unable to submit vote.";
  } finally {
    busy.value = false;
  }
}

// ⭐ button: uses a free or bought Super Like. If you have none left,
// it offers to buy one (20 points) and uses it straight away on this card.
async function superLike() {
  if (busy.value || buying.value || timeUp.value || !card.value) {
    return;
  }

  if (totalSuperLikesLeft.value < 1) {
    const bought = await buySuperLike();
    if (!bought || !card.value) return; // cancelled, not enough points, or time ran out
  }

  pendingSpecial.value = "super";
  card.value.fling(true);
}

function veto() {
  if (
    usedVeto.value ||
    busy.value ||
    buying.value ||
    timeUp.value ||
    !card.value
  ) {
    return;
  }

  pendingSpecial.value = "veto";
  card.value.fling(false);
}

function onKey(e) {
  if (
    busy.value ||
    buying.value ||
    timeUp.value ||
    !current.value
  ) {
    return;
  }

  if (e.key === "ArrowRight") {
    card.value?.fling(true);
  }

  if (e.key === "ArrowLeft") {
    card.value?.fling(false);
  }

  if (e.key === "ArrowUp") {
    superLike();
  }
}

// =====================================================
// VOTING TIMER
// =====================================================

const now = ref(Date.now());
let ticker = null;

const endsAt = computed(
  () => store.session?.votingEndsAt || null
);

const secondsLeft = computed(() =>
  endsAt.value
    ? Math.max(
        0,
        Math.ceil((endsAt.value - now.value) / 1000)
      )
    : null
);

const timeUp = computed(
  () => secondsLeft.value === 0
);

const percentLeft = computed(() => {
  if (!endsAt.value) return 100;

  const total =
    (store.session?.voteSeconds ?? 45) * 1000;

  return Math.max(
    0,
    Math.min(
      100,
      ((endsAt.value - now.value) / total) * 100
    )
  );
});

watch(timeUp, async up => {
  for (
    let i = 0;
    i < 3 &&
    up &&
    timeUp.value &&
    store.session?.status === "voting";
    i++
  ) {
    await finishVoting(code).catch(() => {});

    await new Promise(resolve =>
      setTimeout(resolve, 2000)
    );
  }
});

// =====================================================
// ROUND 2 AND WINNER NAVIGATION
// =====================================================

watch(
  () => store.session?.round,
  () => {
    votedHere.value = [];
    pendingSpecial.value = null;
  }
);

watch(
  () => store.session?.status,
  status => {
    if (status === "done") {
      router.push(`/sessions/${code}/winner`);
    }
  }
);

// =====================================================
// LIFECYCLE
// =====================================================

onMounted(() => {
  store.watch(code);

  window.addEventListener("keydown", onKey);

  ticker = setInterval(() => {
    now.value = Date.now();
  }, 250);

  if (auth.user?.uid) {
    listHistory(auth.user.uid)
      .then(items => {
        const counts = {};

        items.forEach(history => {
          counts[history.placeId] =
            (counts[history.placeId] || 0) + 1;
        });

        visits.value = counts;
      })
      .catch(() => {});
  }
});

onUnmounted(() => {
  store.stop();
  window.removeEventListener("keydown", onKey);
  clearInterval(ticker);
});

// =====================================================
// LIVE TALLY HELPERS
// =====================================================

const yesCount = placeId =>
  Object.values(votes.value[placeId] || {}).filter(
    value => value === true
  ).length;

// Free Super Likes: { uid: placeId }. Bought ones: { uid: [placeId, placeId, ...] }.
// Count both, the same way the server's winner.js does, so the tally matches the result.
const superCount = placeId => {
  const free = Object.values(superLikes.value).filter(
    id => id === placeId
  ).length;
  
  const bought = Object.values(store.session?.extraSuperLikeVotes || {})
    .flat()
    .filter(id => id === placeId).length;
  return free + bought;
};


const vetoedBy = placeId => {
  const uid = Object.keys(vetoes.value).find(
    userId => vetoes.value[userId] === placeId
  );

  return uid
    ? store.session.members[uid]?.name
    : null;
};

function voteClass(placeId, uid) {
  const value = votes.value[placeId]?.[uid];

  if (value === true) {
    return "bg-green-500 text-white";
  }

  if (value === false) {
    return "bg-red-100 text-red-600";
  }

  return "bg-slate-100 text-slate-400";
}
</script>

<template>
  <div v-if="notMember" class="card text-center">
    <p class="mb-3">
      You're not part of this session.
    </p>

    <RouterLink
      to="/sessions"
      class="btn-primary"
    >
      Back to Makan Session
    </RouterLink>
  </div>

  <template v-else>
    <p class="kicker">Station 4 · Voting Arena</p>
    <h1 class="page-title">
      Swipe to vote
    </h1>

    <p class="mb-3 text-sm text-slate-500">
      Drag right for yes, left for no, or use
      ← → ↑ on your keyboard ·
      {{ doneCount }}/{{ activePlaces.length }} done
    </p>

    <!-- ROUND 2 -->

    <p
      v-if="store.session?.round === 2"
      class="mb-3 rounded-2xl border-[3px] border-ink bg-amber-100 p-3 text-sm font-bold"
      data-testid="round-two"
    >
      🔄 <b>Round 2.</b>
      Nobody matched, so we relaxed the limits
      (+5 min walk, +10 min queue).
      Places marked "slightly outside your criteria"
      go a little beyond your original limits.
    </p>

    <!-- TIMER -->

    <div
      v-if="secondsLeft !== null"
      class="mb-4"
      data-testid="countdown"
    >
      <div
        class="flex justify-between text-sm font-semibold"
      >
        <span>Time left</span>

        <span
          :class="
            secondsLeft <= 10
              ? 'text-red-600'
              : ''
          "
        >
          {{ secondsLeft }}s
        </span>
      </div>

      <div
        class="mt-1 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-white"
      >
        <div
          class="h-full transition-all duration-300"
          :class="
            secondsLeft <= 10
              ? 'bg-red-500'
              : 'bg-accent'
          "
          :style="{
            width: percentLeft + '%'
          }"
        ></div>
      </div>
    </div>


    <!-- SWIPE DECK + LIVE TALLY -->

    <div class="grid gap-4 md:grid-cols-2">
      <div class="overflow-hidden px-1 pb-2">
        <SwipeCard
          v-if="currentCard && !timeUp"
          ref="card"
          :key="currentCard.id"
          :place="currentCard"
          @vote="vote"
        />

        <div
          v-else-if="timeUp"
          class="card"
        >
          ⏰ Time's up! Working out the result…
        </div>

        <div
          v-else-if="activePlaces.length"
          class="card"
        >
          You've voted on everything.
          Waiting for the others…
        </div>

        <p
          v-else
          class="card text-slate-500"
        >
          Loading places…
        </p>

        <!-- VOTING BUTTONS -->

        <div
          v-if="currentCard && !timeUp"
          class="mt-4 grid grid-cols-4 gap-2"
        >
          <button
            class="vote-btn bg-red-600 text-white"
            aria-label="Veto"
            title="Veto: removes this place for everyone"
            data-testid="vote-veto"
            :disabled="
              busy ||
              buying ||
              usedVeto
            "
            @click="veto"
          >
            <span class="text-2xl leading-none">🚫</span>
            <span class="text-xs font-black">Veto</span>
          </button>

          <button
            class="vote-btn bg-white"
            aria-label="No"
            data-testid="vote-no"
            :disabled="busy || buying"
            @click="card?.fling(false)"
          >
            <span class="text-2xl leading-none">✕</span>
            <span class="text-xs font-black">Nope</span>
          </button>

          <button
            class="vote-btn bg-[#7bc96f]"
            aria-label="Yes"
            data-testid="vote-yes"
            :disabled="busy || buying"
            @click="card?.fling(true)"
          >
            <span class="text-2xl leading-none">✓</span>
            <span class="text-xs font-black">Yes</span>
          </button>

          <button
            class="vote-btn bg-accent"
            aria-label="Super Like"
            title="Super Like: counts double"
            data-testid="vote-super"
            :disabled="busy || buying"
            @click="superLike"
          >
            <span class="text-2xl leading-none">⭐</span>
            <span class="text-xs font-black">{{ totalSuperLikesLeft > 0 ? "Super" : "20 pts" }}</span>
          </button>
        </div>

        <p
          class="mt-2 text-center text-sm font-black"
        >
          ⭐ {{ totalSuperLikesLeft > 0 ? `${totalSuperLikesLeft} Super Like(s) left` : "Next ⭐ costs 20 pts" }} ·
          🚫 Veto
          {{ usedVeto ? "used" : "available" }}
        </p>
        <p v-if="purchaseMessage" class="mt-1 text-center text-sm font-black text-green-800">
          {{ purchaseMessage }} Unused bought ⭐ are refunded at the end.
        </p>

        <p
          v-if="error"
          class="error mt-2"
        >
          {{ error }}
        </p>
      </div>

      <!-- LIVE TALLY -->

      <div class="card">
        <h2 class="mb-1 font-bold">
          Live tally
        </h2>

        <ul class="divide-y divide-slate-100">
          <li
            v-for="p in places"
            :key="p.id"
            class="py-3"
            :class="
              vetoedBy(p.id)
                ? 'opacity-50'
                : ''
            "
            data-testid="tally-row"
          >
            <div
              class="flex justify-between text-sm"
            >
              <span
                class="font-semibold"
                :class="
                  vetoedBy(p.id)
                    ? 'line-through'
                    : ''
                "
              >
                {{ p.name }}

                <span
                  v-if="superCount(p.id)"
                  class="ml-1"
                >
                  ⭐×{{ superCount(p.id) }}
                </span>
              </span>

              <span
                v-if="vetoedBy(p.id)"
                class="text-xs text-red-600"
              >
                Vetoed by {{ vetoedBy(p.id) }}
              </span>

              <span
                v-else
                class="font-mono"
              >
                {{ yesCount(p.id) }}/{{ members.length }}
                yes
              </span>
            </div>

            <div
              class="mt-1 h-2 rounded-full bg-slate-100"
            >
              <div
                class="h-2 rounded-full bg-brand transition-all duration-500"
                :style="{
                  width:
                    (members.length
                      ? (yesCount(p.id) / members.length) * 100
                      : 0) + '%'
                }"
              ></div>
            </div>

            <div class="mt-2 flex gap-1">
              <span
                v-for="[uid, m] in members"
                :key="uid"
                :title="m.name"
                class="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold"
                :class="voteClass(p.id, uid)"
              >
                {{ m.name?.[0]?.toUpperCase() }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* Vote buttons: chunky game buttons that press down. Owner: M3 */
.vote-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-height: 68px; border-radius: 18px; border: 4px solid #17213b; box-shadow: 0 5px 0 #17213b; transition: transform .1s;
}
.vote-btn:active { transform: translateY(4px); box-shadow: 0 1px 0 #17213b; }
.vote-btn:disabled { opacity: .35; transform: none; }
</style>
