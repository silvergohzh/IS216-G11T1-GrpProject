<!-- My menu: hawkers add, edit and remove dishes, and mark them sold out. Owner: M6
     The menu is saved on the stall (places/{id}.menu) and shows up straight away on the
     public stall page and in pre-orders. -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchStall, addDish, updateDish, deleteDish } from '../services/hawkers'

const auth = useAuthStore()
const stall = ref(null)
const edits = ref({})            // dishId -> { name, price, stock } being edited (price in dollars, as text)
const newDish = ref({ name: '', price: '', stock: '' })
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
      // stock: empty box means "no limit"
      copies[dish.id] = { name: dish.name, price: (dish.price / 100).toFixed(2), stock: dish.stock ?? '' }
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
  await addDish(newDish.value.name, newDish.value.price, newDish.value.stock)
  newDish.value = { name: '', price: '', stock: '' }
}, 'Dish added')

const save = dish => run(() => updateDish(dish.id, edits.value[dish.id]), 'Saved')
const toggleSoldOut = dish => run(() => updateDish(dish.id, { available: dish.available === false }))
const remove = dish => run(() => deleteDish(dish.id), 'Dish removed')

</script>

<template>
  <p class="kicker">Hawker HQ</p>
  <h1 class="page-title">My menu</h1>
  <p v-if="stall" class="mb-4 text-slate-600">
    {{ stall.name }} ·
    <RouterLink :to="`/stalls/${stall.id}`" class="font-semibold text-brand" data-testid="public-page-link">View my public page</RouterLink>
  </p>
  <p v-if="error" class="error mb-4">{{ error }}</p>
  <p v-if="message" class="mb-4 rounded-lg bg-brand-light px-3 py-2 text-sm text-brand">{{ message }}</p>

  <div class="max-w-md">
    <!-- Add one dish -->
    <form class="card space-y-3" @submit.prevent="add">
      <h2 class="font-bold">Add a dish</h2>
      <div><label class="label" for="dish-name">Dish name</label><input id="dish-name" v-model="newDish.name" required class="input" /></div>
      <div><label class="label" for="dish-price">Price ($)</label><input id="dish-price" v-model="newDish.price" required type="number" step="0.01" min="0.01" class="input" /></div>
      <div><label class="label" for="dish-stock">Portions left (empty = no limit)</label><input id="dish-stock" v-model="newDish.stock" type="number" step="1" min="0" class="input" /></div>
      <button class="btn-primary" type="submit" :disabled="busy">Add dish</button>
    </form>

  </div>

  <!-- The menu -->
  <section class="card mt-4">
    <h2 class="mb-2 font-bold">Menu ({{ stall?.menu.length || 0 }} dishes)</h2>
    <p v-if="stall && stall.menu.length === 0" class="text-slate-500">No dishes yet. Add one above.</p>
    <ul class="divide-y divide-slate-100">
      <li v-for="dish in stall?.menu || []" :key="dish.id" class="flex flex-wrap items-center gap-2 py-3" data-testid="menu-dish" :data-name="dish.name">
        <template v-if="edits[dish.id]">
          <input v-model="edits[dish.id].name" class="input min-w-40 flex-1" aria-label="Dish name" />
          <input v-model="edits[dish.id].price" type="number" step="0.01" min="0.01" class="input w-28" aria-label="Price" />
          <input v-model="edits[dish.id].stock" type="number" step="1" min="0" placeholder="No limit" class="input w-28" aria-label="Portions left" />
        </template>
        <span v-if="dish.available === false || dish.stock === 0" class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Sold out</span>
        <button class="btn text-sm" :disabled="busy" @click="save(dish)">Save</button>
        <button class="btn text-sm" :disabled="busy" @click="toggleSoldOut(dish)">{{ dish.available === false ? 'Back in stock' : 'Sold out' }}</button>
        <button class="btn text-sm text-red-700" :disabled="busy" @click="remove(dish)">Delete</button>
      </li>
    </ul>
  </section>
</template>
