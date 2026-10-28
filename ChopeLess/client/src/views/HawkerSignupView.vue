<!-- Hawker sign-up: make an account and apply with your stall details. Owner: M6
     After applying, an admin approves it (Admin page). Then the stall goes live
     and you can build your menu on the "My menu" page. -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { applyAsHawker, watchMyApplication } from '../services/hawkers'
import MapView from '../components/MapView.vue'
import { listPlaces } from '../services/places'

const auth = useAuthStore()
const DIETS = ['halal', 'vegetarian', 'no-beef']

// The account (only needed if you are not logged in yet)
const email = ref('')
const password = ref('')

// The stall details
const form = ref({
  applicantName: '',
  stallName: '',
  cuisine: '',
  address: '',
  lat: null,
  lng: null,
  dietary: [],
  serviceModes: ['dine-in', 'takeaway'],
  // [SILVER] parentId field
  parentId: ''      // the hawker centre / food court it is inside ('' = none, a restaurant on its own)
})

const application = ref(null)   // my application, if I already applied
const loading = ref(true)
const error = ref('')
const busy = ref(false)

// The pin on the map, once you have clicked where your stall is
const markers = computed(() =>
  form.value.lat === null ? [] : [{ lat: form.value.lat, lng: form.value.lng, label: form.value.stallName || 'My stall' }]
)

// Watch my application live, so this page changes by itself when the admin decides
let stopWatching = null
function watchApplication() {
  if (stopWatching || !auth.isLoggedIn) return
  stopWatching = watchMyApplication(auth.user.uid, data => {
    application.value = data
    loading.value = false
  })
}
// [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md)
// Hawker centres and food courts, for "Is your stall inside one?"
const centres = ref([])
// [SILVER] END

onMounted(async () => {
  const all = await listPlaces()
  // [SILVER] load the centres for the dropdown
  centres.value = all.filter(p => p.type === 'hawker-centre' || p.type === 'food-court')

  if (auth.isLoggedIn) watchApplication()
  else loading.value = false
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

function pickLocation({ lat, lng }) {
  form.value.lat = lat
  form.value.lng = lng
}

async function submit() {
  error.value = ''
  if (form.value.lat === null) {
    error.value = 'Click the map to show where your stall is'
    return
  }
  busy.value = true
  try {
    // New here? Make the account first (you start as a diner until an admin approves you)
    if (!auth.isLoggedIn) await auth.register(email.value, password.value)
    await applyAsHawker(form.value)
    watchApplication()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

// After an admin approves you, reload so the app picks up your new hawker role
function reload() {
  window.location.href = '/hawker/menu'
}
</script>

<template>
  <p class="kicker">Join the town as a hawker</p>
  <h1 class="page-title">Sell on ChopeLess</h1>
  <p class="mb-4 text-slate-600">Put your stall and menu online, and take pickup orders from hungry groups nearby.</p>

  <p v-if="loading" class="text-slate-500">Loading...</p>

  <!-- Already a hawker (approved) -->
  <div v-else-if="auth.isHawker" class="card space-y-2" data-testid="application-status">
    <p class="text-lg font-bold">Approved! Your stall is live.</p>
    <RouterLink to="/hawker/menu" class="btn-primary inline-block">Set up my menu</RouterLink>
  </div>

  <!-- Applied and waiting -->
  <div v-else-if="application && application.status === 'pending'" class="card space-y-2" data-testid="application-status">
    <p class="text-lg font-bold">Application sent!</p>
    <p><b>{{ application.stallName }}</b> · {{ application.cuisine }} · {{ application.address }}</p>
    <p class="text-slate-600">Waiting for an admin to approve it. You'll be able to add your menu once it's approved.</p>
  </div>

  <!-- Approved: reload to become a hawker -->
  <div v-else-if="application && application.status === 'approved'" class="card space-y-2" data-testid="application-status">
    <p class="text-lg font-bold">Approved! Your stall is live.</p>
    <button class="btn-primary" @click="reload">Set up my menu</button>
  </div>

  <!-- The form (also shown again after a rejection, so you can fix it and apply again) -->
  <form v-else class="card max-w-xl space-y-4" @submit.prevent="submit">
    <p v-if="application && application.status === 'rejected'" class="error" data-testid="application-status">
      Your last application was not approved: {{ application.reason }}. You can fix it and apply again.
    </p>

    <template v-if="!auth.isLoggedIn">
      <h2 class="font-bold">1. Your account</h2>
      <div><label class="label" for="h-email">Email</label><input id="h-email" v-model="email" type="email" required class="input" /></div>
      <div><label class="label" for="h-password">Password</label><input id="h-password" v-model="password" type="password" required minlength="6" class="input" /></div>
    </template>

    <h2 class="font-bold">{{ auth.isLoggedIn ? 'Your stall' : '2. Your stall' }}</h2>
    <div><label class="label" for="h-name">Your name</label><input id="h-name" v-model="form.applicantName" required class="input" /></div>
    <div><label class="label" for="h-stall">Stall name</label><input id="h-stall" v-model="form.stallName" required class="input" /></div>
    <div><label class="label" for="h-cuisine">Cuisine</label><input id="h-cuisine" v-model="form.cuisine" required placeholder="e.g. Chinese, Malay, Western" class="input" /></div>
    <div><label class="label" for="h-address">Address</label><input id="h-address" v-model="form.address" required class="input" /></div>
    <div>
      <!-- [SILVER] START: Hawker centres, food courts, stalls & place tags (built by Myat, see HANDOVER.md) -->
      <label class="label" for="h-parent">Is your stall inside a hawker centre or food court?</label>
      <select id="h-parent" v-model="form.parentId" class="input">
        <option value="">No, it's a restaurant on its own</option>
        <option v-for="c in centres" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <!-- [SILVER] END -->
    </div>

    <div>
      <p class="label">Where is your stall? Click the map</p>
      <MapView :markers="markers" @pick="pickLocation" />
      <p v-if="form.lat !== null" class="mt-1 text-xs text-slate-500">Location picked ✓</p>
    </div>

    <fieldset>
      <legend class="label">Your food is</legend>
      <label v-for="d in DIETS" :key="d" class="mr-4 inline-flex items-center gap-1">
        <input type="checkbox" :value="d" v-model="form.dietary" /> {{ d }}
      </label>
    </fieldset>
    <fieldset>
      <legend class="label">You offer</legend>
      <label class="mr-4 inline-flex items-center gap-1"><input type="checkbox" value="dine-in" v-model="form.serviceModes" /> dine-in</label>
      <label class="inline-flex items-center gap-1"><input type="checkbox" value="takeaway" v-model="form.serviceModes" /> takeaway</label>
    </fieldset>

    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn-primary" type="submit" :disabled="busy">{{ busy ? 'Sending...' : 'Apply' }}</button>
  </form>
</template>
