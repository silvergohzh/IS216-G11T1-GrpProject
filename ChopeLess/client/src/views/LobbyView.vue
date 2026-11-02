<!-- Lobby: see who joined, host sets meeting point and limits, then starts voting. Owner: M3 -->
<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import { useAuthStore } from "../stores/auth";
import {
  updateSettings,
  startVoting,
  leaveSession,
  endSession,
  kickMember,
} from "../services/sessions";
import MapView from "../components/MapView.vue";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const route = useRoute();
const router = useRouter();
const store = useSessionStore();
const auth = useAuthStore();
const code = route.params.code;
const error = ref("");
const starting = ref(false);

const copied = ref(false);
// const shareLink = `${location.origin}/sessions?join=${code}`;

// True once the session has loaded and I'm not one of its members
const notMember = computed(
  () => store.session && !store.session.members?.[auth.user?.uid],
);
// True if the host removed me (so I see why, not just "not part of this session")
const wasKicked = computed(() => !!store.session?.kicked?.[auth.user?.uid]);

// Copy just the 6-letter code so friends can type it on the Makan Session page
async function copyCode() {
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    error.value = "Could not copy. The code is " + code;
  }
}

async function leave() {
  if (!confirm("Leave this session?")) return;
  await leaveSession(code);
  router.push("/sessions");
}

// Host removes someone who shouldn't be here (they can't rejoin with the code)
async function kick(uid, name) {
  if (!confirm(`Remove ${name} from this session?`)) return;
  try {
    await kickMember(code, uid);
  } catch (err) {
    error.value = err.message;
  }
}

async function end() {
  if (!confirm("End the session for everyone?")) return;
  await endSession(code);
  router.push("/sessions");
}

const isHost = computed(() => store.session?.hostUid === auth.user?.uid);
const members = computed(() => Object.entries(store.session?.members || {}));

// If this session was started from a Makan Kakis group, remember who owns the group:
// the host can't kick the group's owner out of the group's own session.
const groupOwnerUid = ref(null);
watch(
  () => store.session?.groupId,
  async (groupId) => {
    if (!groupId) return (groupOwnerUid.value = null);
    const snap = await getDoc(doc(db, "groups", groupId)).catch(() => null);
    groupOwnerUid.value = snap?.data()?.ownerUid || null;
  },
  { immediate: true },
);

onMounted(() => store.watch(code));
onUnmounted(() => store.stop());

// When the host starts voting, every phone moves to the vote page at the same moment
watch(
  () => store.session?.status,
  (status) => {
    if (status === "voting") router.push(`/sessions/${code}/vote`);
  },
);

async function update(changes) {
  try {
    await updateSettings(code, changes);
  } catch (err) {
    error.value = err.message;
  }
}

// [NAWAZ] START: the host must choose a meeting point before voting
// Walking times are measured from the meeting point, so voting can't start without one.
const hasMeetingPoint = computed(() => !!store.session?.meetingPoint?.lat);

// "Use my current location": ask the browser where the host is, and save it as the meeting point
const locating = ref(false);
const locationError = ref("");

function useMyLocation() {
  locationError.value = "";
  if (!navigator.geolocation) {
    locationError.value = "Your browser can't share your location. Tap the map instead.";
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    // It worked: save where the host is
    (position) => {
      locating.value = false;
      update({
        meetingPoint: { lat: position.coords.latitude, lng: position.coords.longitude, label: "My location" },
      });
    },
    // It didn't work: the host said no, or the location couldn't be found
    (err) => {
      locating.value = false;
      locationError.value =
        err.code === err.PERMISSION_DENIED
          ? "Location access was blocked. Tap the map instead."
          : "Couldn't find your location. Tap the map instead.";
    },
    { timeout: 10000 },
  );
}
// [NAWAZ] END
async function start() {
  error.value = "";
  starting.value = true;

  try {
    await startVoting(code);
  } catch (err) {
    const status = err.status ?? err.response?.status;

    if (status === 403) {
      error.value = "403 Forbidden: Only the host can start voting.";
    } else if (status === 404) {
      error.value = "404: Session not found.";
    } else if (status === 409) {
      error.value = "409 Conflict: Voting has already started.";
    } else if (status === 410) {
      error.value = "410: Session has expired.";
    } else if (status === 422) {
      error.value = "422: No restaurants fit the group's preferences.";
    } else {
      error.value = err.message || "Unable to start voting.";
    }
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <!-- Outsiders see this instead of the lobby -->
  <div v-if="notMember" class="card text-center">
    <p class="mb-3">{{ wasKicked ? "The host removed you from this session." : "You're not part of this session." }}</p>
    <RouterLink to="/sessions" class="btn-primary"
      >Back to Makan Session</RouterLink
    >
  </div>
  <div v-else-if="store.session">
    <p class="kicker">Station 4 · Lobby</p>
    <h1 class="page-title">Lobby</h1>
    <!-- the table code: big and yellow, because it's the one thing friends need -->
    <div
      class="mb-4 flex flex-wrap items-center gap-4 rounded-3xl border-4 border-ink bg-accent px-5 py-3 shadow-[0_6px_0_#17213b]"
    >
      <div class="flex-1">
        <p class="text-xs font-black tracking-widest">TABLE CODE</p>
        <span
          class="font-display text-5xl tracking-[0.2em]"
          data-testid="session-code"
          >{{ code }}</span
        >
      </div>
      <p class="flex-[1_1_220px] font-bold">
        Share the code with friends. Voting starts when the host is ready.
      </p>
      <button class="btn text-sm" data-testid="copy-code" @click="copyCode">
        {{ copied ? "Code copied ✓" : "Copy code" }}
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="card">
        <h2 class="mb-2 text-2xl">Party ({{ members.length }})</h2>
        <ul class="divide-y divide-slate-100" data-testid="member-list">
          <li v-for="[uid, m] in members" :key="uid" class="py-2">
            <b>{{ m.name }}</b>
            <span
              v-if="uid === store.session.hostUid"
              class="ml-1 rounded-full border-2 border-ink bg-coral px-2 py-0.5 text-xs font-black"
              >Host</span
            >
            <span
              v-if="uid === auth.user?.uid"
              class="ml-1 text-xs text-slate-400"
              >(you)</span
            >
            <span class="text-sm text-slate-500"
              >· ${{ m.budget }} ·
              {{ m.dietary.join(", ") || "no restrictions" }}</span
            >
            <button
              v-if="isHost && uid !== auth.user?.uid && uid !== groupOwnerUid"
              class="btn ml-2 !min-h-8 px-3 py-0.5 text-xs !text-red-700"
              :aria-label="`Remove ${m.name}`"
              @click="kick(uid, m.name)"
            >
              Remove
            </button>
          </li>
        </ul>
      </div>

      <div class="card space-y-3">
        <h2>Game rules</h2>
        <!-- Dine-in or takeaway: only the host can change it, everyone sees it live -->
        <div>
          <span class="label">Eating</span>
          <div class="flex gap-2" data-testid="service-mode">
            <button
              v-for="mode in ['dine-in', 'takeaway']"
              :key="mode"
              type="button"
              :class="
                store.session.serviceMode === mode
                  ? 'btn flex-1 !bg-ink !text-white'
                  : 'btn flex-1'
              "
              :disabled="!isHost"
              @click="update({ serviceMode: mode })"
            >
              {{ mode === "dine-in" ? "🍽️ Dine in" : "🥡 Takeaway" }}
            </button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label" for="walk">Max walk (min)</label>
            <input
              id="walk"
              type="number"
              class="input"
              min="1"
              :value="store.session.maxWalkMins"
              :disabled="!isHost"
              @change="update({ maxWalkMins: Math.max(1, +$event.target.value || 1) })"
            />
          </div>
          <div>
            <label class="label" for="wait">Max queue (min)</label>
            <input
              id="wait"
              type="number"
              class="input"
              min="1"
              :value="store.session.maxWaitMins"
              :disabled="!isHost"
              @change="update({ maxWaitMins: Math.max(1, +$event.target.value || 1) })"
            />
          </div>
          <div>
            <label class="label" for="timer">Vote timer</label>
            <select
              id="timer"
              class="input"
              :value="store.session.voteSeconds ?? 45"
              :disabled="!isHost"
              @change="update({ voteSeconds: +$event.target.value })"
            >
              <option :value="45">45 s</option>
              <option :value="0">No timer</option>
            </select>
          </div>
        </div>
        <div>
          <span class="label"
            >Meeting point {{ isHost ? "(tap the map)" : "" }}</span
          >
          <!-- [NAWAZ] START: "Use my current location" (host only) -->
          <div v-if="isHost" class="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="btn text-sm"
              :disabled="locating"
              data-testid="use-my-location"
              @click="useMyLocation"
            >
              {{ locating ? "Finding you…" : "📍 Use my current location" }}
            </button>
            <span class="text-sm">or choose a starting point on the map</span>
          </div>
          <p v-if="locationError" role="alert" class="mb-2 text-sm font-medium text-red-700" data-testid="location-error">
            {{ locationError }}
          </p>
          <!-- [NAWAZ] END -->
          <!-- [NAWAZ] START: the meeting point uses the "start" badge (icon: 'start') -->
          <MapView
            :markers="
              store.session.meetingPoint
                ? [{ ...store.session.meetingPoint, label: 'Meet here', icon: 'start' }]
                : []
            "
            @pick="
              (p) =>
                isHost &&
                update({ meetingPoint: { ...p, label: 'Meeting point' } })
            "
          />
          <!-- [NAWAZ] END -->
        </div>
        <div
          v-if="error"
          role="alert"
          class="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700"
        >
          {{ error }}
        </div>
        <!-- [NAWAZ] START: meeting point is required, and Start voting waits for it -->
        <p
          v-if="isHost && !hasMeetingPoint"
          class="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700"
          data-testid="meeting-point-required"
        >
          📍 Required: choose a meeting point before you start voting.
          Walking times are measured from there.
        </p>
        <button
          v-if="isHost"
          class="btn-primary w-full min-h-14 font-display text-2xl font-normal"
          :disabled="starting || members.length < 2 || !hasMeetingPoint"
          @click="start"
        >
          {{ starting ? "Building shortlist…" : "Start voting" }}
        </button>
        <!-- [NAWAZ] END -->
        <p
          v-if="isHost && members.length < 2"
          class="text-center text-xs text-slate-500"
        >
          Share the code: you need at least 2 people to vote.
        </p>
        <p v-else-if="!isHost" class="text-sm text-slate-500">
          Waiting for the host to start…
        </p>
        <button v-if="isHost" class="w-full text-sm text-red-600" @click="end">
          End session for everyone
        </button>
        <button v-else class="w-full text-sm text-red-600" @click="leave">
          Leave session
        </button>
      </div>
    </div>
  </div>
  <p v-else-if="store.error" class="error">{{ store.error }}</p>
  <p v-else>Loading…</p>
</template>
