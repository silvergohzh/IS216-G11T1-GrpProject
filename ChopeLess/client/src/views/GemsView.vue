<!-- Hidden Gems board: list (live), add, edit, delete, upvote/un-upvote, photo, map picker, ratings, unlimited reviews, community menu. Owner: M5 -->

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  watchGems, addGem, updateGem, deleteGem, upvoteGem, unvoteGem,
  getReviews, saveReview, updateReview, deleteReview, photoToDataUrl, UPVOTES_NEEDED, adminDeleteGem
} from '../services/gems'
import MapView from '../components/MapView.vue'
import GemMenu from '../components/GemMenu.vue'
import { api } from '../lib/api'   // [NAWAZ] for "Find on map" (address lookup)
import { nextTick } from 'vue'     // [NAWAZ] wait for the page to update before scrolling to the lookup result

const auth = useAuthStore()
const gems = ref([])
// Same fields as a place in places.json, so a gem can join the voting pool as one
const empty = () => ({
  id: null, name: '', mustTry: '', cuisine: '', address: '', lat: null, lng: null,
  priceMin: 5, priceMax: 10, dietary: [], serviceModes: ['dine-in', 'takeaway'], waitMins: 10, imageUrl: ''
})
const form = ref(empty())
const error = ref('')
const photoKey = ref(0)   // changing this resets the file picker
const menuId = ref(null)  // which gem's community menu is open
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
// [NAWAZ] START: "Find on map" - look up the typed address (OpenStreetMap, through our server)
const finding = ref(false)       // true while waiting for the lookup
const found = ref(null)          // the match the pin is on: { label, lat, lng }
const allResults = ref([])       // every match, so the user can pick a different one
const findMessage = ref('')      // "Couldn't find..." or a problem with the lookup
const lookupResultEl = ref(null) // the box under the map with "Found:", "Not right? Try:" or the message

// Show "Found: ..." only while the pin is still on that match (tapping the map moves the pin by hand)
const pinOnFound = computed(() =>
  !!found.value && form.value.lat === found.value.lat && form.value.lng === found.value.lng
)
const otherResults = computed(() => allResults.value.filter(r => r !== found.value))

// Put the pin on one of the matches
function chooseResult(result) {
  form.value.lat = result.lat
  form.value.lng = result.lng
  found.value = result
}

async function findOnMap() {
  findMessage.value = ''
  found.value = null
  allResults.value = []
  finding.value = true
  try {
    const { results } = await api(`/geocode?q=${encodeURIComponent(form.value.address.trim())}`)
    if (results.length === 0) {
      findMessage.value = "Couldn't find that address, tap the map instead."
      return
    }
    allResults.value = results
    chooseResult(results[0])   // the best match first
  } catch (err) {
    findMessage.value = err.message
  } finally {
    finding.value = false
  }
  // Make sure the user sees the answer. "nearest" only scrolls if the box is off screen,
  // so the page stays still when it's already visible.
  await nextTick()
  lookupResultEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
// [NAWAZ] END

function resetForm() {
  form.value = empty()
  photoKey.value++
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
    waitMins: g.waitMins ?? 10,
    imageUrl: g.imageUrl || ''
  }
  photoKey.value++
}
async function onPhoto(e) {
  const file = e.target.files?.[0]
  if (!file) return
  error.value = ''
  try {
    form.value.imageUrl = await photoToDataUrl(file)
  } catch {
    error.value = 'Could not use that photo. Try a JPG or PNG.'
  }
}
async function run(action) {
  error.value = ''
  try { await action() } catch (err) { error.value = err.message }
}
const save = () => run(async () => {
  if (!form.value.imageUrl) throw new Error('Add a photo of the place')
  if (form.value.lat == null || form.value.lng == null) {
    throw new Error('Click the map to pick the gem location')
  }
  if (form.value.id) await updateGem(form.value.id, form.value)
  else await addGem(form.value)
  resetForm()
})

// Admin moderation: remove any gem (spam, fake or wrong listings), with its reviews and menu
   const removeAsAdmin = g => {
     if (!window.confirm(`Remove "${g.name}" from Hidden Gems? Its reviews and menu are deleted too.`)) return
     return run(() => adminDeleteGem(g.id))
   }

const priceText = g => {
  if (g.priceMin == null) return `$${g.price}`   // older gems have a single price
  return g.priceMin === g.priceMax ? `$${g.priceMin}` : `$${g.priceMin}–${g.priceMax}`
}

// ---- Average rating: sum of all star ratings / number of ratings, out of 5 ----
const average = g => (g.ratingCount ? g.ratingSum / g.ratingCount : null)
const ratingText = g => {
  const avg = average(g)
  if (avg == null) return 'No ratings yet'
  return `${avg.toFixed(1)} / 5 (${g.ratingCount} ${g.ratingCount === 1 ? 'review' : 'reviews'})`
}

// ---- Upvote: click once to vote, click again to take it back ----
const hasVoted = g => !!auth.user && g.upvoters.includes(auth.user.uid)
const toggleVote = g => run(() => (hasVoted(g) ? unvoteGem(g.id) : upvoteGem(g.id)))

// ---- Reviews (as many as you like) ----
const openId = ref(null)            // which gem's reviews are showing
const reviews = ref([])
const review = ref({ rating: 5, text: '' })
const editingReviewId = ref(null)   // set while you are editing one of your own reviews
const reviewError = ref('')

const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n)
const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString() : '')
const resetReviewForm = () => {
  editingReviewId.value = null
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
function startEditReview(r) {
  editingReviewId.value = r.id
  review.value = { rating: r.rating, text: r.text }
}
async function submitReview(g) {
  reviewError.value = ''
  try {
    if (editingReviewId.value) await updateReview(g.id, editingReviewId.value, review.value)
    else await saveReview(g.id, review.value)
    resetReviewForm()
    await loadReviews(g.id)
  } catch (err) {
    reviewError.value = err.message
  }
}
async function removeReview(g, r) {
  reviewError.value = ''
  try {
    await deleteReview(g.id, r.id)
    if (editingReviewId.value === r.id) resetReviewForm()
    await loadReviews(g.id)
  } catch (err) {
    reviewError.value = err.message
  }
}
</script>

<template>
  <h1 class="page-title">Hidden Gems</h1>
  <p class="mb-4 text-slate-600">Places the big apps miss. {{ UPVOTES_NEEDED }} upvotes and a gem joins the voting pool.</p>
  <p class="mb-4 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
    Hidden Gems are suggested by the community, not verified by ChopeLess or the stalls. Details, menus and prices are subject to accuracy.
  </p>

  <div class="grid gap-4 md:grid-cols-[2fr_3fr]">
    <form v-if="auth.isLoggedIn" class="card space-y-3 self-start" @submit.prevent="save">
      <h2 class="font-bold">{{ form.id ? 'Edit gem' : 'Add a gem' }}</h2>
      <div><label class="label" for="g-name">Stall or shop</label><input id="g-name" v-model="form.name" required class="input" /></div>
      <div><label class="label" for="g-try">Must try (optional)</label><input id="g-try" v-model="form.mustTry" class="input" /></div>
      <div><label class="label" for="g-cuisine">Cuisine</label><input id="g-cuisine" v-model="form.cuisine" required class="input" placeholder="e.g. Korean, Hawker" /></div>

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
        <label class="label" for="g-photo">Photo of the place</label>
        <input id="g-photo" :key="photoKey" type="file" accept="image/*" class="input" @change="onPhoto" />
        <img v-if="form.imageUrl" :src="form.imageUrl" alt="Preview of the place" class="mt-2 h-32 w-full rounded-xl object-cover" />
        <p v-else class="mt-1 text-xs text-slate-500">Required. A gem needs a photo to join the voting pool.</p>
      </div>

      <!-- [NAWAZ] START: address with a "Find on map" button and a tip, right above the map it fills in -->
      <div>
        <label class="label" for="g-addr">Address</label>
        <div class="flex gap-2">
          <input id="g-addr" v-model="form.address" required class="input flex-1" placeholder="270 Queen Street or 180270" />
          <button type="button" class="btn shrink-0 text-sm" :disabled="!form.address.trim() || finding"
                  data-testid="find-on-map" @click="findOnMap">
            {{ finding ? 'Finding…' : 'Find on map' }}
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-500">Tip: enter the exact street address or postal code. A business name alone may match the wrong place.</p>
      </div>
      <!-- [NAWAZ] END -->

      <div>
        <!-- [NAWAZ] the label mentions the address lookup -->
        <span class="label">Location (find it with the address above, or click the map)</span>
        <MapView :markers="markers" @pick="onPick" />
        <p class="mt-1 text-xs text-slate-500">
          {{ form.lat != null ? `Picked: ${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}` : 'No location picked yet' }}
        </p>
        <!-- [NAWAZ] START: what "Find on map" found, and the other matches to choose from -->
        <!-- lookupResultEl: after a lookup, we scroll this into view if it's off screen -->
        <div ref="lookupResultEl">
          <div v-if="pinOnFound" class="mt-1 space-y-1">
            <p class="text-xs font-semibold text-brand" data-testid="geocode-found">Found: {{ found.label }}</p>
            <div v-if="otherResults.length" class="flex flex-wrap gap-1">
              <span class="text-xs text-slate-500">Not right? Try:</span>
              <button v-for="r in otherResults" :key="`${r.lat},${r.lng}`" type="button"
                      class="rounded-full border border-slate-300 px-2 py-0.5 text-left text-xs"
                      data-testid="geocode-other" @click="chooseResult(r)">
                {{ r.label }}
              </button>
            </div>
          </div>
          <p v-if="findMessage" class="mt-1 text-xs font-semibold text-red-700" data-testid="geocode-message">{{ findMessage }}</p>
        </div>
        <!-- [NAWAZ] END -->
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <div class="flex gap-2">
        <button class="btn-primary" type="submit">{{ form.id ? 'Save' : 'Add gem' }}</button>
        <button v-if="form.id" type="button" class="btn" @click="resetForm">Cancel</button>
      </div>
    </form>
    <p v-else class="card">Log in to add and upvote gems.</p>

    <ul class="space-y-3">
      <li v-for="g in gems" :key="g.id" class="card space-y-3" data-testid="gem-row">
        <img v-if="g.imageUrl" :src="g.imageUrl" :alt="g.name" class="h-32 w-full rounded-xl object-cover" />
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-bold">{{ g.name }}</h3>
            <p class="text-sm text-slate-500">{{ g.mustTry }}{{ g.mustTry ? ' · ' : '' }}{{ priceText(g) }} · {{ g.address }}</p>
            <p v-if="g.cuisine" class="text-xs text-slate-500">
              {{ g.cuisine }}<template v-if="g.waitMins != null"> · ~{{ g.waitMins }} min wait</template>
            </p>
            <p class="text-sm font-semibold text-amber-600">
              <span v-if="average(g) != null" class="mr-1">{{ stars(Math.round(average(g))) }}</span>{{ ratingText(g) }}
            </p>
            <p class="text-xs font-semibold text-brand">▲ {{ g.upvoters.length }} {{ g.upvoters.length >= UPVOTES_NEEDED ? '· in voting pool' : '' }}</p>
          </div>
          <div v-if="auth.isLoggedIn" class="flex flex-wrap justify-end gap-1">
            <button class="btn text-sm" :class="hasVoted(g) ? 'font-bold text-brand' : ''"
                    :aria-pressed="hasVoted(g)" :title="hasVoted(g) ? 'Remove my upvote' : 'Upvote'"
                    @click="toggleVote(g)">▲</button>
            <template v-if="g.submittedBy === auth.user.uid">
              <button class="btn text-sm" @click="edit(g)">Edit</button>
              <button class="btn text-sm text-red-600" @click="run(() => deleteGem(g.id))">Delete</button>
            </template>
               <button v-if="auth.user.role === 'admin' && g.submittedBy !== auth.user.uid" class="btn text-sm text-red-600" @click="removeAsAdmin(g)">Remove (admin)</button>
          </div>
        </div>

        <div class="flex gap-4">
          <button type="button" class="text-sm font-semibold text-brand" @click="menuId = menuId === g.id ? null : g.id">
            {{ menuId === g.id ? 'Hide menu' : 'Menu' }}
          </button>
          <button type="button" class="text-sm font-semibold text-brand" @click="toggleReviews(g)">
            {{ openId === g.id ? 'Hide reviews' : 'Reviews' }}
          </button>
        </div>

        <GemMenu v-if="menuId === g.id" :gem-id="g.id" :gem-owner-uid="g.submittedBy" editable />

        <div v-if="openId === g.id" class="space-y-3 border-t border-slate-200 pt-3" data-testid="reviews">
          <ul class="space-y-2">
            <li v-for="r in reviews" :key="r.id" class="rounded-lg bg-slate-50 p-2 text-sm">
              <div class="flex items-center justify-between gap-2">
                <span><span class="font-semibold">{{ r.authorName }}</span>
                  <span class="ml-2 text-amber-500">{{ stars(r.rating) }}</span></span>
                <span class="text-xs text-slate-400">{{ fmtDate(r.createdAt) }}{{ r.editedAt ? ' · edited' : '' }}</span>
              </div>
              <p class="mt-1 text-slate-700">{{ r.text }}</p>
              <div v-if="auth.isLoggedIn && r.authorUid === auth.user.uid" class="mt-1 flex gap-3 text-xs">
                <button type="button" class="font-semibold text-brand" @click="startEditReview(r)">Edit</button>
                <button type="button" class="text-red-600" @click="removeReview(g, r)">Delete</button>
              </div>
            </li>
            <li v-if="!reviews.length && !reviewError" class="text-sm text-slate-500">No reviews yet.</li>
          </ul>

          <form v-if="auth.isLoggedIn" class="space-y-2" @submit.prevent="submitReview(g)">
            <p class="text-sm font-semibold">{{ editingReviewId ? 'Edit your review' : 'Write a review' }}</p>
            <div class="flex items-center gap-2">
              <label class="label !mb-0" :for="'rate-' + g.id">Rating</label>
              <select :id="'rate-' + g.id" v-model.number="review.rating" class="input !w-auto">
                <option v-for="n in 5" :key="n" :value="n">{{ n }} {{ n === 1 ? 'star' : 'stars' }}</option>
              </select>
            </div>
            <textarea v-model="review.text" required maxlength="300" rows="2" class="input"
                      placeholder="Share what you tried (max 300 characters)"></textarea>
            <div class="flex gap-2">
              <button class="btn-primary text-sm" type="submit">{{ editingReviewId ? 'Update review' : 'Post review' }}</button>
              <button v-if="editingReviewId" type="button" class="btn text-sm" @click="resetReviewForm">Cancel</button>
            </div>
          </form>
          <p v-else class="text-sm text-slate-500">Log in to leave a review.</p>

          <p v-if="reviewError" class="error">{{ reviewError }}</p>
        </div>
      </li>
      <li v-if="!gems.length && !error" class="text-slate-500">No gems yet. Be the first.</li>
    </ul>
  </div>
</template>