<!-- Hidden Gems board: list (live), add, edit, delete, upvote, map picker, reviews. Owner: M5 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  watchGems, addGem, updateGem, deleteGem, upvoteGem,
  getReviews, saveReview, deleteReview, UPVOTES_NEEDED
} from '../services/gems'
import MapView from '../components/MapView.vue'

const auth = useAuthStore()
const gems = ref([])
const empty = () => ({ id: null, name: '', mustTry: '', price: 5, address: '', lat: null, lng: null, dietary: [] })
const form = ref(empty())
const error = ref('')
let unsubscribe

onMounted(() => { unsubscribe = watchGems(list => (gems.value = list), err => (error.value = err.message)) })
onUnmounted(() => unsubscribe?.())

// ---- Add / edit form ----
const markers = computed(() =>
  form.value.lat != null ? [{ lat: form.value.lat, lng: form.value.lng, label: form.value.name || 'Selected spot' }] : []
)
function onPick({ lat, lng }) {
  form.value.lat = lat
  form.value.lng = lng
}
function edit(g) {
  form.value = { ...g, dietary: [...(g.dietary || [])] }
}
async function run(action) {
  error.value = ''
  try { await action() } catch (err) { error.value = err.message }
}
const save = () => run(async () => {
  if (form.value.lat == null || form.value.lng == null) {
    throw new Error('Click the map to pick the gem location')
  }
  if (form.value.id) await updateGem(form.value.id, form.value)
  else await addGem(form.value)
  form.value = empty()
})

// ---- Reviews ----
const openId = ref(null)          // which gem's reviews are showing
const reviews = ref([])
const review = ref({ rating: 5, text: '' })
const reviewError = ref('')

const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n)
const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString() : '')

async function loadReviews(id) {
  reviewError.value = ''
  try {
    reviews.value = await getReviews(id)
    // pre-fill the form with your own review so you can edit it
    const mine = auth.user && reviews.value.find(r => r.id === auth.user.uid)
    review.value = mine ? { rating: mine.rating, text: mine.text } : { rating: 5, text: '' }
  } catch (err) {
    reviewError.value = err.message
  }
}
async function toggleReviews(g) {
  if (openId.value === g.id) { openId.value = null; return }
  openId.value = g.id
  reviews.value = []
  await loadReviews(g.id)
}
async function submitReview(g) {
  reviewError.value = ''
  try {
    await saveReview(g.id, review.value)
    await loadReviews(g.id)
  } catch (err) {
    reviewError.value = err.message
  }
}
async function removeReview(g) {
  reviewError.value = ''
  try {
    await deleteReview(g.id)
    await loadReviews(g.id)
  } catch (err) {
    reviewError.value = err.message
  }
}
</script>

<template>
  <h1 class="page-title">Hidden Gems</h1>
  <p class="mb-4 text-slate-600">Places the big apps miss. {{ UPVOTES_NEEDED }} upvotes and a gem joins the voting pool.</p>

  <div class="grid gap-4 md:grid-cols-[2fr_3fr]">
    <form v-if="auth.isLoggedIn" class="card space-y-3 self-start" @submit.prevent="save">
      <h2 class="font-bold">{{ form.id ? 'Edit gem' : 'Add a gem' }}</h2>
      <div><label class="label" for="g-name">Stall or shop</label><input id="g-name" v-model="form.name" required class="input" /></div>
      <div><label class="label" for="g-try">Must try</label><input id="g-try" v-model="form.mustTry" class="input" /></div>
      <div><label class="label" for="g-price">Price ($)</label><input id="g-price" v-model.number="form.price" type="number" min="1" class="input" /></div>
      <div><label class="label" for="g-addr">Address</label><input id="g-addr" v-model="form.address" class="input" /></div>

      <fieldset>
        <legend class="label">Dietary</legend>
        <label class="mr-4 text-sm"><input type="checkbox" value="halal" v-model="form.dietary" /> Halal</label>
        <label class="text-sm"><input type="checkbox" value="vegetarian" v-model="form.dietary" /> Vegetarian</label>
      </fieldset>

      <div>
        <span class="label">Location (click the map)</span>
        <MapView :markers="markers" @pick="onPick" />
        <p class="mt-1 text-xs text-slate-500">
          {{ form.lat != null ? `Picked: ${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}` : 'No location picked yet' }}
        </p>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <div class="flex gap-2">
        <button class="btn-primary" type="submit">{{ form.id ? 'Save' : 'Add gem' }}</button>
        <button v-if="form.id" type="button" class="btn" @click="form = empty()">Cancel</button>
      </div>
    </form>
    <p v-else class="card">Log in to add and upvote gems.</p>

    <ul class="space-y-3">
      <li v-for="g in gems" :key="g.id" class="card space-y-3" data-testid="gem-row">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-bold">{{ g.name }}</h3>
            <p class="text-sm text-slate-500">{{ g.mustTry }} · ${{ g.price }} · {{ g.address }}</p>
            <p class="text-xs font-semibold text-brand">▲ {{ g.upvoters.length }} {{ g.upvoters.length >= UPVOTES_NEEDED ? '· in voting pool' : '' }}</p>
          </div>
          <div v-if="auth.isLoggedIn" class="flex flex-wrap justify-end gap-1">
            <button class="btn text-sm" :disabled="g.upvoters.includes(auth.user.uid)" @click="run(() => upvoteGem(g.id))">▲</button>
            <template v-if="g.submittedBy === auth.user.uid">
              <button class="btn text-sm" @click="edit(g)">Edit</button>
              <button class="btn text-sm text-red-600" @click="run(() => deleteGem(g.id))">Delete</button>
            </template>
          </div>
        </div>

        <button type="button" class="text-sm font-semibold text-brand" @click="toggleReviews(g)">
          {{ openId === g.id ? 'Hide reviews' : 'Reviews' }}
        </button>

        <div v-if="openId === g.id" class="space-y-3 border-t border-slate-200 pt-3" data-testid="reviews">
          <ul class="space-y-2">
            <li v-for="r in reviews" :key="r.id" class="rounded-lg bg-slate-50 p-2 text-sm">
              <div class="flex items-center justify-between gap-2">
                <span><span class="font-semibold">{{ r.authorName }}</span>
                  <span class="ml-2 text-amber-500">{{ stars(r.rating) }}</span></span>
                <span class="text-xs text-slate-400">{{ fmtDate(r.createdAt) }}</span>
              </div>
              <p class="mt-1 text-slate-700">{{ r.text }}</p>
              <button v-if="auth.isLoggedIn && r.id === auth.user.uid" type="button"
                      class="mt-1 text-xs text-red-600" @click="removeReview(g)">Delete my review</button>
            </li>
            <li v-if="!reviews.length && !reviewError" class="text-sm text-slate-500">No reviews yet.</li>
          </ul>

          <form v-if="auth.isLoggedIn" class="space-y-2" @submit.prevent="submitReview(g)">
            <div class="flex items-center gap-2">
              <label class="label !mb-0" :for="'rate-' + g.id">Rating</label>
              <select :id="'rate-' + g.id" v-model.number="review.rating" class="input !w-auto">
                <option v-for="n in 5" :key="n" :value="n">{{ n }} {{ n === 1 ? 'star' : 'stars' }}</option>
              </select>
            </div>
            <textarea v-model="review.text" required maxlength="300" rows="2" class="input"
                      placeholder="Share what you tried (max 300 characters)"></textarea>
            <button class="btn-primary text-sm" type="submit">Post review</button>
          </form>
          <p v-else class="text-sm text-slate-500">Log in to leave a review.</p>

          <p v-if="reviewError" class="error">{{ reviewError }}</p>
        </div>
      </li>
      <li v-if="!gems.length && !error" class="text-slate-500">No gems yet. Be the first.</li>
    </ul>
  </div>
</template>