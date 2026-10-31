<!-- Hidden Gems board: list (live), add, edit, delete, upvote/un-upvote, map picker, reviews (post/edit/delete). Owner: M5 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  watchGems, addGem, updateGem, deleteGem, upvoteGem, unvoteGem,
  getReviews, saveReview, updateReview, deleteReview, UPVOTES_NEEDED
} from '../services/gems'
import MapView from '../components/MapView.vue'

const auth = useAuthStore()
const gems = ref([])
// Same fields as a place in places.json, so a gem can join the voting pool as one
const empty = () => ({
  id: null, name: '', mustTry: '', cuisine: '', address: '', lat: null, lng: null,
  priceMin: 5, priceMax: 10, dietary: [], serviceModes: ['dine-in', 'takeaway'], waitMins: 10
})
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
  // Older gems may be missing the newer fields, so fall back to sensible defaults
  form.value = {
    ...empty(),
    ...g,
    dietary: [...(g.dietary || [])],
    serviceModes: [...(g.serviceModes || ['dine-in', 'takeaway'])],
    priceMin: g.priceMin ?? g.price ?? 5,
    priceMax: g.priceMax ?? g.price ?? 10,
    waitMins: g.waitMins ?? 10
  }
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

const priceText = g => {
  if (g.priceMin == null) return `$${g.price}`   // older gems have a single price
  return g.priceMin === g.priceMax ? `$${g.priceMin}` : `$${g.priceMin}–${g.priceMax}`
}

// ---- Upvote: click once to vote, click again to take it back ----
const hasVoted = g => !!auth.user && g.upvoters.includes(auth.user.uid)
const toggleVote = g => run(() => (hasVoted(g) ? unvoteGem(g.id) : upvoteGem(g.id)))

// ---- Reviews ----
const openId = ref(null)          // which gem's reviews are showing
const reviews = ref([])
const review = ref({ rating: 5, text: '' })
const editingReview = ref(false)  // true while you are editing your own review
const reviewError = ref('')

const myReview = computed(() => (auth.user ? reviews.value.find(r => r.id === auth.user.uid) : null))
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n)
const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString() : '')
const resetReviewForm = () => {
  editingReview.value = false
  review.value = { rating: 5, text: '' }
}

async function loadReviews(id) {
  reviewError.value = ''
  try {
    reviews.value = await getReviews(id)
  } catch (err) {
    reviewError.value = err.message
  }
}
async function toggleReviews(g) {
  if (openId.value === g.id) { openId.value = null; return }
  openId.value = g.id
  reviews.value = []
  resetReviewForm()
  await loadReviews(g.id)
}
function startEditReview() {
  review.value = { rating: myReview.value.rating, text: myReview.value.text }
  editingReview.value = true
}
async function submitReview(g) {
  reviewError.value = ''
  try {
    if (editingReview.value) await updateReview(g.id, review.value)
    else await saveReview(g.id, review.value)
    resetReviewForm()
    await loadReviews(g.id)
  } catch (err) {
    reviewError.value = err.message
  }
}
async function removeReview(g) {
  reviewError.value = ''
  try {
    await deleteReview(g.id)
    resetReviewForm()
    await loadReviews(g.id)
  } catch (err) {
    reviewError.value = err.message
  }
}
</script>

<template>
  <p class="kicker">Station 3 · Treasure Cove</p>
  <h1 class="page-title">Hidden Gems</h1>
  <p class="mb-4 text-slate-600">Places the big apps miss. {{ UPVOTES_NEEDED }} upvotes and a gem joins the voting pool.</p>

  <div class="grid gap-4 md:grid-cols-[2fr_3fr]">
    <form v-if="auth.isLoggedIn" class="card card-sun space-y-3 self-start" @submit.prevent="save">
      <h2>{{ form.id ? 'Edit gem' : 'Add a gem' }}</h2>
      <div><label class="label" for="g-name">Stall or shop</label><input id="g-name" v-model="form.name" required class="input" /></div>
      <div><label class="label" for="g-try">Must try (optional)</label><input id="g-try" v-model="form.mustTry" class="input" /></div>
      <div><label class="label" for="g-cuisine">Cuisine</label><input id="g-cuisine" v-model="form.cuisine" required class="input" placeholder="e.g. Korean, Hawker" /></div>
      <div><label class="label" for="g-addr">Address</label><input id="g-addr" v-model="form.address" required class="input" /></div>

      <div class="grid grid-cols-2 gap-2">
        <div><label class="label" for="g-min">Min price ($)</label><input id="g-min" v-model.number="form.priceMin" type="number" min="0" required class="input" /></div>
        <div><label class="label" for="g-max">Max price ($)</label><input id="g-max" v-model.number="form.priceMax" type="number" min="0" required class="input" /></div>
      </div>

      <div><label class="label" for="g-wait">Typical wait (minutes)</label><input id="g-wait" v-model.number="form.waitMins" type="number" min="0" max="180" required class="input" /></div>

      <fieldset>
        <legend class="label">Service</legend>
        <label class="mr-4 text-sm"><input type="checkbox" value="dine-in" v-model="form.serviceModes" /> Dine-in</label>
        <label class="text-sm"><input type="checkbox" value="takeaway" v-model="form.serviceModes" /> Takeaway</label>
      </fieldset>

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
            <h3 class="text-2xl leading-tight">{{ g.name }}</h3>
            <p class="text-sm font-bold">{{ g.mustTry }}{{ g.mustTry ? ' · ' : '' }}{{ priceText(g) }} · {{ g.address }}</p>
            <p v-if="g.cuisine" class="text-xs text-slate-500">
              {{ g.cuisine }}<template v-if="g.waitMins != null"> · ~{{ g.waitMins }} min wait</template>
            </p>
            <p class="mt-1 flex flex-wrap items-center gap-2">
              <span class="chip">▲ {{ g.upvoters.length }} upvotes</span>
              <span v-if="g.upvoters.length >= UPVOTES_NEEDED" class="chip !bg-ink !text-accent">IN THE VOTE POOL</span>
            </p>
          </div>
          <div v-if="auth.isLoggedIn" class="flex flex-wrap justify-end gap-1">
            <button class="btn text-sm" :class="hasVoted(g) ? '!bg-accent' : ''"
                    :aria-pressed="hasVoted(g)" :title="hasVoted(g) ? 'Remove my upvote' : 'Upvote'"
                    @click="toggleVote(g)">▲</button>
            <template v-if="g.submittedBy === auth.user.uid">
              <button class="btn text-sm" @click="edit(g)">Edit</button>
              <button class="btn text-sm text-red-600" @click="run(() => deleteGem(g.id))">Delete</button>
            </template>
          </div>
        </div>

        <button type="button" class="btn self-start text-sm" @click="toggleReviews(g)">
          {{ openId === g.id ? 'Hide reviews' : 'Reviews' }}
        </button>

        <div v-if="openId === g.id" class="space-y-3 border-t-[3px] border-dashed border-ink pt-3" data-testid="reviews">
          <ul class="space-y-2">
            <li v-for="r in reviews" :key="r.id" class="rounded-2xl bg-sky p-3 text-sm">
              <div class="flex items-center justify-between gap-2">
                <span><span class="font-semibold">{{ r.authorName }}</span>
                  <span class="ml-2 text-amber-500">{{ stars(r.rating) }}</span></span>
                <span class="text-xs text-slate-400">{{ fmtDate(r.createdAt) }}{{ r.editedAt ? ' · edited' : '' }}</span>
              </div>
              <p class="mt-1 text-slate-700">{{ r.text }}</p>
              <div v-if="auth.isLoggedIn && r.id === auth.user.uid" class="mt-1 flex gap-3 text-xs">
                <button type="button" class="font-semibold text-brand" @click="startEditReview">Edit my review</button>
                <button type="button" class="text-red-600" @click="removeReview(g)">Delete my review</button>
              </div>
            </li>
            <li v-if="!reviews.length && !reviewError" class="text-sm text-slate-500">No reviews yet.</li>
          </ul>

          <form v-if="auth.isLoggedIn && (!myReview || editingReview)" class="space-y-2" @submit.prevent="submitReview(g)">
            <div class="flex items-center gap-2">
              <label class="label !mb-0" :for="'rate-' + g.id">Rating</label>
              <select :id="'rate-' + g.id" v-model.number="review.rating" class="input !w-auto">
                <option v-for="n in 5" :key="n" :value="n">{{ n }} {{ n === 1 ? 'star' : 'stars' }}</option>
              </select>
            </div>
            <textarea v-model="review.text" required maxlength="300" rows="2" class="input"
                      placeholder="Share what you tried (max 300 characters)"></textarea>
            <div class="flex gap-2">
              <button class="btn-primary text-sm" type="submit">{{ editingReview ? 'Update review' : 'Post review' }}</button>
              <button v-if="editingReview" type="button" class="btn text-sm" @click="resetReviewForm">Cancel</button>
            </div>
          </form>
          <p v-else-if="!auth.isLoggedIn" class="text-sm text-slate-500">Log in to leave a review.</p>

          <p v-if="reviewError" class="error">{{ reviewError }}</p>
        </div>
      </li>
      <li v-if="!gems.length && !error" class="text-slate-500">No gems yet. Be the first.</li>
    </ul>
  </div>
</template>