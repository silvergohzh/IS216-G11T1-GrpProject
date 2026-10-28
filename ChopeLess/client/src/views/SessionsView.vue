<!-- Create or join a Makan Session. Owner: M3 (Session front-end) -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { createSession, joinSession } from '../services/sessions'
import { getProfile } from '../services/users'


const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
// Only the diets our places are tagged with. ('no-beef' was removed: no place has that tag,
// so ticking it filtered out every place and voting could never start.)
const DIETS = ['halal', 'vegetarian']

const me = ref({ name: auth.user?.name || '', budget: 8, dietary: [] })
const joinCode = ref(route.query.join || '') // filled in when opening a shared link
const loading = ref(false) 

const error = ref('')

// Pre-fill from the profile (M6)
onMounted(async () => {
  const profile = await getProfile(auth.user.uid).catch(() => null)
  // (old profiles may still have 'no-beef' saved, so keep only the diets above)
  if (profile) me.value = { name: profile.name || '', budget: profile.defaultBudget || 8, dietary: (profile.dietary || []).filter(d => DIETS.includes(d)) }
})

// Check the form before talking to the database
function check() {
  if (!me.value.name.trim()) return 'Please enter your name.'
  if (!(me.value.budget >= 1)) return 'Budget must be at least $1.'
  return ''
}

async function create() {
  error.value = check()
  if (error.value) return
  loading.value = true
  try { router.push(`/sessions/${await createSession(me.value)}`) } catch (err) { error.value = err.message } finally { loading.value = false }
}

async function join() {
  error.value = check()   // clear the old error and re-check name + budget
  if (error.value) return
  loading.value = true
  try { router.push(`/sessions/${await joinSession(joinCode.value, me.value)}`) } catch (err) { error.value = err.message } finally { loading.value = false }
}
</script>

<template>
  <p class="kicker">Station 4 · Voting Arena</p>
  <h1 class="page-title">Makan Session</h1>
  <p class="mb-4 text-slate-600">Start a session and share the code, or join a friend's.</p>
      <div class="mb-4 flex flex-wrap gap-2">
    <RouterLink to="/groups" class="btn text-sm">Start from a Makan Kakis group</RouterLink>
    
  </div>


  <div class="grid gap-4 md:grid-cols-2">
    <div class="card space-y-3">
      <span class="chip !bg-coral">PLAYER 1</span>
      <h2>You</h2>
      <div><label class="label" for="s-name">Name</label><input id="s-name" v-model="me.name" class="input" /></div>
      <div><label class="label" for="s-budget">Budget ($)</label><input id="s-budget" v-model.number="me.budget" type="number" min="1" class="input" /></div>
      <fieldset><legend class="label">Dietary needs</legend>
        <label v-for="d in DIETS" :key="d" class="mr-2 mt-1 inline-flex min-h-11 items-center gap-2 rounded-full border-[3px] border-ink bg-white px-3 font-extrabold has-[:checked]:bg-accent"><input type="checkbox" :value="d" v-model="me.dietary" /> {{ d }}</label>
      </fieldset>
    </div>

    <div class="space-y-4">
        <div class="card card-sun">
        <h2 class="mb-2">Open a table</h2>
        <p class="mb-3 font-bold">You'll be the host: you set the rules and start the vote.</p>
        <button class="btn-primary !bg-white font-display text-xl font-normal" data-testid="create-session" :disabled="loading" @click="create">{{ loading ? 'Creating…' : 'Create session' }}</button>
      </div>
        <form class="card card-navy space-y-2" @submit.prevent="join">
        <span class="chip !bg-accent">PLAYER 2+</span>
        <h2>Join with a code</h2>
        <input v-model="joinCode" class="input font-display text-2xl uppercase tracking-[0.3em] text-ink" placeholder="ABCDEF" maxlength="6" required data-testid="join-code" />
        <button class="btn" type="submit" :disabled="loading">Join</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>
