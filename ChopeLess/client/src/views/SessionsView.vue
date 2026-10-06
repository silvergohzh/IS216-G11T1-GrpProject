<!-- Create or join a Makan Session. Owner: M3 (Session front-end) -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { createSession, joinSession } from '../services/sessions'
import { getProfile } from '../services/users'

const router = useRouter()
const auth = useAuthStore()
const DIETS = ['halal', 'vegetarian', 'no-beef']

const me = ref({ name: auth.user?.name || '', budget: 8, dietary: [] })
const joinCode = ref('')
const error = ref('')

// Pre-fill from the profile (M6)
onMounted(async () => {
  const profile = await getProfile(auth.user.uid).catch(() => null)
  if (profile) me.value = { name: profile.name, budget: profile.defaultBudget, dietary: profile.dietary || [] }
})

async function create() {
  error.value = ''
  try { router.push(`/sessions/${await createSession(me.value)}`) } catch (err) { error.value = err.message }
}

async function join() {
  error.value = ''
  try { router.push(`/sessions/${await joinSession(joinCode.value, me.value)}`) } catch (err) { error.value = err.message }
}
</script>

<template>
  <h1 class="page-title">Makan Session</h1>
  <p class="mb-4 text-slate-600">Start a session and share the code, or join a friend's.</p>

  <div class="grid gap-4 md:grid-cols-2">
    <div class="card space-y-3">
      <h2 class="font-bold">You</h2>
      <div><label class="label" for="s-name">Name</label><input id="s-name" v-model="me.name" class="input" /></div>
      <div><label class="label" for="s-budget">Budget ($)</label><input id="s-budget" v-model.number="me.budget" type="number" min="1" class="input" /></div>
      <fieldset><legend class="label">Dietary needs</legend>
        <label v-for="d in DIETS" :key="d" class="mr-4 inline-flex items-center gap-1"><input type="checkbox" :value="d" v-model="me.dietary" /> {{ d }}</label>
      </fieldset>
    </div>

    <div class="space-y-4">
      <div class="card">
        <h2 class="mb-2 font-bold">Host a session</h2>
        <button class="btn-primary" data-testid="create-session" @click="create">Create session</button>
      </div>
      <form class="card space-y-2" @submit.prevent="join">
        <h2 class="font-bold">Join with a code</h2>
        <input v-model="joinCode" class="input uppercase" placeholder="ABCDEF" maxlength="6" required data-testid="join-code" />
        <button class="btn" type="submit">Join</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>
