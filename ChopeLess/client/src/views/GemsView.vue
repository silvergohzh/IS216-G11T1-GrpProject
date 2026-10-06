<!-- Hidden Gems board: list (live), add, edit, delete, upvote. Owner: M5 -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { watchGems, addGem, updateGem, deleteGem, upvoteGem, UPVOTES_NEEDED } from '../services/gems'

const auth = useAuthStore()
const gems = ref([])
const empty = () => ({ id: null, name: '', mustTry: '', price: 5, address: '' })
const form = ref(empty())
const error = ref('')
let unsubscribe

onMounted(() => { unsubscribe = watchGems(list => (gems.value = list), err => (error.value = err.message)) })
onUnmounted(() => unsubscribe?.())

async function run(action) {
  error.value = ''
  try { await action() } catch (err) { error.value = err.message }
}
const save = () => run(async () => {
  if (form.value.id) await updateGem(form.value.id, form.value)
  else await addGem(form.value)
  form.value = empty()
})

// TODO (M5): pick the location on a map (use M2's MapView) so gems get lat/lng and can join the voting pool
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
      <p v-if="error" class="error">{{ error }}</p>
      <div class="flex gap-2">
        <button class="btn-primary" type="submit">{{ form.id ? 'Save' : 'Add gem' }}</button>
        <button v-if="form.id" type="button" class="btn" @click="form = empty()">Cancel</button>
      </div>
    </form>
    <p v-else class="card">Log in to add and upvote gems.</p>

    <ul class="space-y-3">
      <li v-for="g in gems" :key="g.id" class="card flex items-start justify-between gap-3" data-testid="gem-row">
        <div>
          <h3 class="font-bold">{{ g.name }}</h3>
          <p class="text-sm text-slate-500">{{ g.mustTry }} · ${{ g.price }} · {{ g.address }}</p>
          <p class="text-xs font-semibold text-brand">▲ {{ g.upvoters.length }} {{ g.upvoters.length >= UPVOTES_NEEDED ? '· in voting pool' : '' }}</p>
        </div>
        <div v-if="auth.isLoggedIn" class="flex flex-wrap justify-end gap-1">
          <button class="btn text-sm" :disabled="g.upvoters.includes(auth.user.uid)" @click="run(() => upvoteGem(g.id))">▲</button>
          <template v-if="g.submittedBy === auth.user.uid">
            <button class="btn text-sm" @click="form = { ...g }">Edit</button>
            <button class="btn text-sm text-red-600" @click="run(() => deleteGem(g.id))">Delete</button>
          </template>
        </div>
      </li>
      <li v-if="!gems.length && !error" class="text-slate-500">No gems yet. Be the first.</li>
    </ul>
  </div>
</template>
