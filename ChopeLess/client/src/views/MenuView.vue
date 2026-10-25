<!-- My menu: hawkers add, edit and remove dishes, or scan a photo of their menu board with AI. Owner: M6
     The menu is saved on the stall (places/{id}.menu) and shows up straight away on the
     public stall page and in pre-orders. -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchStall, addDish, addManyDishes, updateDish, deleteDish, scanMenuPhoto } from '../services/hawkers'
import ProofUpload from '../components/ProofUpload.vue'

const auth = useAuthStore()
const stall = ref(null)
const edits = ref({})            // dishId -> { name, price } being edited (price in dollars, as text)
const newDish = ref({ name: '', price: '' })
const draft = ref([])            // dishes the AI read: [{ include, name, price }] (price in dollars, as text)
const error = ref('')
const message = ref('')
const busy = ref(false)
let stopWatching = null

onMounted(() => {
  // Live: the list updates by itself after every change
  stopWatching = watchStall(auth.user.placeId, data => {
    stall.value = data
    // Keep an editable copy of each dish (prices shown in dollars, e.g. "4.50")
    const copies = {}
    for (const dish of data?.menu || []) {
      copies[dish.id] = { name: dish.name, price: (dish.price / 100).toFixed(2) }
    }
    edits.value = copies
  }, err => (error.value = err.message))
})
onUnmounted(() => {
  if (stopWatching) stopWatching()
})

// Runs a server call, shows a message or an error, and disables buttons while waiting
async function run(action, doneText) {
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    await action()
    if (doneText) message.value = doneText
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

// ---------- Type it in ----------
const add = () => run(async () => {
  await addDish(newDish.value.name, newDish.value.price)
  newDish.value = { name: '', price: '' }
}, 'Dish added')

const save = dish => run(() => updateDish(dish.id, edits.value[dish.id]), 'Saved')
const toggleSoldOut = dish => run(() => updateDish(dish.id, { available: dish.available === false }))
const remove = dish => run(() => deleteDish(dish.id), 'Dish removed')

// ---------- Scan a photo with AI ----------
const scan = photo => run(async () => {
  const result = await scanMenuPhoto(photo)
  // Show what the AI read as an editable draft. Nothing is saved until "Add to my menu".
  draft.value = result.items.map(item => ({ include: true, name: item.name, price: (item.price / 100).toFixed(2) }))
  if (draft.value.length === 0) throw new Error('No dishes found. Try a clearer photo.')
}, 'Check the dishes below, fix anything the AI got wrong, then add them.')

const saveDraft = () => run(async () => {
  const chosen = draft.value.filter(d => d.include).map(d => ({ name: d.name, price: d.price }))
  await addManyDishes(chosen)
  draft.value = []
}, 'Dishes added to your menu')
</script>

<template>
  <h1 class="page-title">My menu</h1>
  <p v-if="stall" class="mb-4 text-slate-600">
    {{ stall.name }} ·
    <RouterLink :to="`/stalls/${stall.id}`" class="font-semibold text-brand" data-testid="public-page-link">View my public page</RouterLink>
  </p>
  <p v-if="error" class="error mb-4">{{ error }}</p>
  <p v-if="message" class="mb-4 rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{{ message }}</p>

  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Add one dish -->
    <form class="card space-y-3" @submit.prevent="add">
      <h2 class="font-bold">Add a dish</h2>
      <div><label class="label" for="dish-name">Dish name</label><input id="dish-name" v-model="newDish.name" required class="input" /></div>
      <div><label class="label" for="dish-price">Price ($)</label><input id="dish-price" v-model="newDish.price" required type="number" step="0.01" min="0.01" class="input" /></div>
      <button class="btn-primary" type="submit" :disabled="busy">Add dish</button>
    </form>

    <!-- Scan a menu photo with AI -->
    <section class="card space-y-3">
      <h2 class="font-bold">Or scan your menu board 📷</h2>
      <p class="text-sm text-slate-600">Take a photo of your menu. AI reads the dishes and prices for you to check.</p>
      <ProofUpload label="Photo of your menu" button-text="Read my menu" :busy="busy" @send="scan" />
    </section>
  </div>

  <!-- The AI's draft: check it, then add -->
  <section v-if="draft.length > 0" class="card mt-4 space-y-2" data-testid="scan-draft">
    <h2 class="font-bold">Dishes the AI found</h2>
    <div v-for="(d, i) in draft" :key="i" class="flex flex-wrap items-center gap-2" data-testid="draft-row">
      <input type="checkbox" v-model="d.include" :aria-label="`Include ${d.name}`" />
      <input v-model="d.name" class="input flex-1" aria-label="Dish name" />
      <input v-model="d.price" type="number" step="0.01" min="0.01" class="input w-28" aria-label="Price" />
    </div>
    <div class="flex gap-2">
      <button class="btn-primary" :disabled="busy" @click="saveDraft">Add {{ draft.filter(d => d.include).length }} dishes to my menu</button>
      <button class="btn" @click="draft = []">Discard</button>
    </div>
  </section>

  <!-- The menu -->
  <section class="card mt-4">
    <h2 class="mb-2 font-bold">Menu ({{ stall?.menu.length || 0 }} dishes)</h2>
    <p v-if="stall && stall.menu.length === 0" class="text-slate-500">No dishes yet. Add one above, or scan your menu board.</p>
    <ul class="divide-y divide-slate-100">
      <li v-for="dish in stall?.menu || []" :key="dish.id" class="flex flex-wrap items-center gap-2 py-3" data-testid="menu-dish">
        <template v-if="edits[dish.id]">
          <input v-model="edits[dish.id].name" class="input min-w-40 flex-1" aria-label="Dish name" />
          <input v-model="edits[dish.id].price" type="number" step="0.01" min="0.01" class="input w-28" aria-label="Price" />
        </template>
        <span v-if="dish.available === false" class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Sold out</span>
        <button class="btn text-sm" :disabled="busy" @click="save(dish)">Save</button>
        <button class="btn text-sm" :disabled="busy" @click="toggleSoldOut(dish)">{{ dish.available === false ? 'Back in stock' : 'Sold out' }}</button>
        <button class="btn text-sm text-red-700" :disabled="busy" @click="remove(dish)">Delete</button>
      </li>
    </ul>
  </section>
</template>
