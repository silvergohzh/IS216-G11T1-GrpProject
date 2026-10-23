<!-- Swipe deck + live tally + timer, Super Like, Veto and round 2. Owner: M3 -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import { useAuthStore } from "../stores/auth";
import { castVote, finishVoting, buyExtraSuper } from "../services/sessions";
import { api } from "../lib/api";
import { listHistory } from "../services/history";
import SwipeCard from "../components/SwipeCard.vue";

const route = useRoute();
const router = useRouter();
const store = useSessionStore();
const auth = useAuthStore();
const code = route.params.code;

const card = ref(null); // the SwipeCard on screen, so the buttons can fling it
const busy = ref(false); // true while a vote is being sent (stops double votes)
const error = ref("");
const votedHere = ref([]); // places I voted on in this tab (shows the next card instantly)
const pendingSpecial = ref(null); // 'super' or 'veto' while the card is flying off
const visits = ref({}); // placeId -> how many times I've eaten there (Part 7)

const places = computed(() => store.session?.shortlist || []);
const votes = computed(() => store.session?.votes || {});
const members = computed(() => Object.entries(store.session?.members || {}));
const myUid = computed(() => auth.user?.uid);
const notMember = computed(
  () => store.session && !store.session.members?.[myUid.value],
);

// ---------- Part 3: Super Like and Veto ----------
const superLikes = computed(() => store.session?.superLikes || {}); // { uid: placeId }
const vetoes = computed(() => store.session?.vetoes || {}); // { uid: placeId }
const vetoedIds = computed(() => Object.values(vetoes.value));
const usedSuper = computed(() => !!superLikes.value[myUid.value]);
// Super Likes: 1 free per session; after that each costs PRICE Makan Points,
// as many as your points allow (one per card, since you vote on each card once). Same rules as the server.
const PRICE = 20;
const boughtCount = computed(() => Number(store.session?.boughtSupers?.[myUid.value] || 0));
const usedBonus = computed(() => [].concat(store.session?.bonusSuperLikes?.[myUid.value] || []).length);
const canSuper = computed(() => !usedSuper.value || usedBonus.value < boughtCount.value); // a free or already-paid ⭐ is ready
const canBuy = computed(() => !canSuper.value);   // free one used: an extra ⭐ just needs enough points
const balance = ref(null);   // my Makan Points, shown under the buttons
const buying = ref(false);
// The ⭐ button is disabled while busy, at the limit, or when I can't afford the next one
const superDisabled = computed(() =>
  busy.value || buying.value ||
  (!canSuper.value && (!canBuy.value || (balance.value !== null && balance.value < PRICE))),
);

async function loadBalance() {
  try { balance.value = (await api("/points/me")).balance; } catch { /* leave it hidden */ }
}
// Pays for one extra Super Like. Returns true if it worked.
async function buySuper() {
  buying.value = true;
  error.value = "";
  try {
    const r = await buyExtraSuper(code);
    balance.value = r.balance;   // the line under the buttons updates to the new balance
    return true;
  } catch (err) {
    error.value = err.message;
    return false;
  } finally {
    buying.value = false;
  }
}

const usedVeto = computed(() => !!vetoes.value[myUid.value]);
// Vetoed places are taken out of everyone's deck
const activePlaces = computed(() =>
  places.value.filter((p) => !vetoedIds.value.includes(p.id)),
);

// The next card = the first place still in play that I haven't voted on yet
const current = computed(() =>
  activePlaces.value.find(
    (p) =>
      !votedHere.value.includes(p.id) &&
      votes.value[p.id]?.[myUid.value] === undefined,
  ),
);
// The same card, plus my "been here" count for the badge (Part 7)
const currentCard = computed(
  () =>
    current.value && {
      ...current.value,
      visits: visits.value[current.value.id] || 0,
    },
);
const doneCount = computed(
  () =>
    activePlaces.value.filter(
      (p) => votes.value[p.id]?.[myUid.value] !== undefined,
    ).length,
);

async function vote(yes) {
  if (busy.value || !current.value) return;
  busy.value = true;
  error.value = "";
  const special = pendingSpecial.value; // was this a Super Like or a Veto?
  pendingSpecial.value = null;
  const placeId = current.value.id;
  votedHere.value.push(placeId);
  try {
    await castVote(code, placeId, yes, special);
  } catch (err) {
    votedHere.value = votedHere.value.filter((id) => id !== placeId); // put the card back
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
// ⭐: uses the free one if I have it; otherwise asks to pay PRICE points, then super-likes this card
async function superLike() {
  if (busy.value || buying.value || !card.value) return;
  if (!canSuper.value) {
    if (!canBuy.value) return;
    if (!confirm(`Use ${PRICE} Makan Points for another Super Like on this place?`)) return;
    if (!(await buySuper())) return;   // payment failed: the error shows under the buttons
  }
  pendingSpecial.value = "super";
  card.value?.fling(true); // same fly-off animation as a yes
}

function veto() {
  if (usedVeto.value || busy.value || !card.value) return;
  pendingSpecial.value = "veto";
  card.value.fling(false); // same fly-off animation as a no
}

// Keyboard: → yes, ← no, ↑ Super Like
function onKey(e) {
  if (e.key === "ArrowRight") card.value?.fling(true);
  if (e.key === "ArrowLeft") card.value?.fling(false);
  if (e.key === "ArrowUp") superLike();
}

// ---------- Part 4: vote timer ----------
const now = ref(Date.now()); // ticks 4 times a second so the countdown moves
let ticker = null;
const endsAt = computed(() => store.session?.votingEndsAt || null); // set by the server
const secondsLeft = computed(() =>
  endsAt.value
    ? Math.max(0, Math.ceil((endsAt.value - now.value) / 1000))
    : null,
);
const timeUp = computed(() => secondsLeft.value === 0);
const percentLeft = computed(() => {
  if (!endsAt.value) return 100;
    const total = (store.session?.voteSeconds || 45) * 1000;
  return Math.max(0, Math.min(100, ((endsAt.value - now.value) / total) * 100));
});

// When time runs out, ask the server to work out the result (it ignores repeats)
watch(timeUp, async (up) => {
  for (
    let i = 0;
    i < 3 && up && timeUp.value && store.session?.status === "voting";
    i++
  ) {
    await finishVoting(code).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
});

// ---------- Part 6: round 2 starts a fresh deck ----------
watch(
  () => store.session?.round,
  () => {
    votedHere.value = [];
  },
);

// Everyone moves to the winner page together
watch(
  () => store.session?.status,
  (s) => {
    if (s === "done") router.push(`/sessions/${code}/winner`);
  },
);

onMounted(() => {
  store.watch(code);
  loadBalance();
  window.addEventListener("keydown", onKey);
  ticker = setInterval(() => {
    now.value = Date.now();
  }, 250);
  // Part 7: count how often I've eaten at each place, for the "Been here" badge
  listHistory(auth.user.uid)
    .then((items) => {
      const counts = {};
      items.forEach((h) => {
        counts[h.placeId] = (counts[h.placeId] || 0) + 1;
      });
      visits.value = counts;
    })
    .catch(() => {});
});
onUnmounted(() => {
  store.stop();
  window.removeEventListener("keydown", onKey);
  clearInterval(ticker);
});

// ---------- live tally helpers ----------
const yesCount = (placeId) =>
  Object.values(votes.value[placeId] || {}).filter((v) => v === true).length;
// Free + bought Super Likes on this place (shown as ⭐×2 in the tally)
const superCount = (placeId) =>
  [
    ...Object.values(superLikes.value),
        ...Object.values(store.session?.bonusSuperLikes || {}).flat(),
  ].filter((id) => id === placeId).length;

const vetoedBy = (placeId) => {
  const uid = Object.keys(vetoes.value).find(
    (u) => vetoes.value[u] === placeId,
  );
  return uid ? store.session.members[uid]?.name : null;
};
function voteClass(placeId, uid) {
  const v = votes.value[placeId]?.[uid];
  if (v === true) return "bg-green-500 text-white";
  if (v === false) return "bg-red-100 text-red-600";
  return "bg-slate-100 text-slate-400"; // hasn't voted yet
}
</script>

<template>
  <div v-if="notMember" class="card text-center">
    <p class="mb-3">You're not part of this session.</p>
    <RouterLink to="/sessions" class="btn-primary"
      >Back to Makan Session</RouterLink
    >
  </div>

  <template v-else>
    <h1 class="page-title">Swipe to vote</h1>
    <p class="mb-3 text-sm text-slate-500">
      Drag right for yes, left for no, or use ← → ↑ on your keyboard ·
      {{ doneCount }}/{{ activePlaces.length }} done
    </p>

    <!-- Part 6: round 2 banner -->
    <p
      v-if="store.session?.round === 2"
      class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
      data-testid="round-two"
    >
      🔄 <b>Round 2.</b> No match, so we widened the search (+5 min walk, +10 min queue).
    </p>

    <!-- Part 4: countdown bar -->
    <div v-if="secondsLeft !== null" class="mb-4" data-testid="countdown">
      <div class="flex justify-between text-sm font-semibold">
        <span>Time left</span>
        <span :class="secondsLeft <= 10 ? 'text-red-600' : ''"
          >{{ secondsLeft }}s</span
        >
      </div>
      <div class="mt-1 h-2 rounded-full bg-slate-100">
        <div
          class="h-2 rounded-full transition-all duration-300"
          :class="secondsLeft <= 10 ? 'bg-red-500' : 'bg-brand'"
          :style="{ width: percentLeft + '%' }"
        ></div>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="overflow-hidden px-1 pb-2">
        <SwipeCard
          v-if="currentCard && !timeUp"
          ref="card"
          :key="currentCard.id"
          :place="currentCard"
          @vote="vote"
        />
        <div v-else-if="timeUp" class="card">
          ⏰ Time's up! Working out the result…
        </div>
        <div v-else-if="activePlaces.length" class="card">
          You've voted on everything. Waiting for the others…
        </div>
        <p v-else class="card text-slate-500">Loading places…</p>

        <div
          v-if="currentCard && !timeUp"
          class="mt-4 flex items-center justify-center gap-4"
        >
          <button
            class="h-12 w-12 rounded-full border-2 border-slate-300 bg-white text-lg disabled:opacity-30"
            aria-label="Veto"
            title="Veto: removes this place for everyone (once per session)"
            data-testid="vote-veto"
            :disabled="busy || usedVeto"
            @click="veto"
          >
            🚫
          </button>
          <button
            class="h-16 w-16 rounded-full border-2 border-red-300 bg-white text-2xl text-red-600 disabled:opacity-40"
            aria-label="No"
            data-testid="vote-no"
            :disabled="busy"
            @click="card?.fling(false)"
          >
            ✕
          </button>
          <button
            class="h-16 w-16 rounded-full border-2 border-green-300 bg-white text-2xl text-brand disabled:opacity-40"
            aria-label="Yes"
            data-testid="vote-yes"
            :disabled="busy"
            @click="card?.fling(true)"
          >
            ✓
          </button>
          <div class="relative">
            <button
              class="h-12 w-12 rounded-full border-2 border-amber-300 bg-white text-lg disabled:opacity-30"
              aria-label="Super Like"
              :title="canSuper ? 'Super Like: +1 for this place (free)' : `Super Like for ${PRICE} Makan Points`"
              data-testid="vote-super"
              :disabled="superDisabled"
              @click="superLike"
            >
              ⭐
            </button>
            <!-- Small tag under the star: free, or its price -->
            <span class="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold"
                  :class="canSuper ? 'text-slate-400' : 'text-amber-700'">
              {{ canSuper ? "free" : `${PRICE} pts` }}
            </span>
          </div>
        </div>

        <p class="mt-6 text-center text-xs text-slate-400">
          🚫 Veto {{ usedVeto ? "used" : "available" }}<span v-if="balance !== null"> · {{ balance }} Makan Points left</span>
        </p>

        <p v-if="error" class="error mt-2">{{ error }}</p>
      </div>

      <div class="card">
        <h2 class="mb-1 font-bold">Live tally</h2>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="p in places"
            :key="p.id"
            class="py-3"
            :class="vetoedBy(p.id) ? 'opacity-50' : ''"
            data-testid="tally-row"
          >
            <div class="flex justify-between text-sm">
              <span
                class="font-semibold"
                :class="vetoedBy(p.id) ? 'line-through' : ''"
              >
                {{ p.name }}
                <span v-if="superCount(p.id)" class="ml-1"
                  >⭐×{{ superCount(p.id) }}</span
                >
              </span>
              <span v-if="vetoedBy(p.id)" class="text-xs text-red-600"
                >Vetoed by {{ vetoedBy(p.id) }}</span
              >
              <span v-else class="font-mono"
                >{{ yesCount(p.id) }}/{{ members.length }} yes</span
              >
            </div>
            <div class="mt-1 h-2 rounded-full bg-slate-100">
              <div
                class="h-2 rounded-full bg-brand transition-all duration-500"
                :style="{
                  width:
                    (members.length
                      ? (yesCount(p.id) / members.length) * 100
                      : 0) + '%',
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
