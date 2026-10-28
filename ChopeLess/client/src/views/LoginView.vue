<!-- Log in / sign up. Owner: M6 -->
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usingEmulator } from '../lib/firebase'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const error = ref('')

// Turn Firebase error codes into plain messages
const messages = {
  'auth/invalid-credential': 'Wrong email or password.',
  // The emulator reports these separately; real Firebase folds both into invalid-credential
  'auth/user-not-found': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/email-already-in-use': 'That email already has an account. Log in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/network-request-failed': usingEmulator
    ? 'Cannot reach the Firebase emulator. Is "npm run emulators" running?'
    : 'Network error. Check your internet connection.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase API key in client/.env is wrong. Copy it again from the Firebase console, then restart npm run dev.'
}

async function submit() {
  error.value = ''
  try {
    if (isSignUp.value) await auth.register(email.value, password.value)
    else await auth.login(email.value, password.value)
    router.push(route.query.next || '/sessions')
  } catch (err) {
    error.value = messages[err.code] || err.message
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-wrap items-start gap-8 py-4">
    <!-- left: what ChopeLess is, so first-time visitors (and the prof) get it in 5 seconds -->
    <div class="flex flex-[1_1_340px] flex-col gap-4">
      <p class="font-display text-6xl leading-none">Chope<span class="text-white [-webkit-text-stroke:3px_#17213b]">Less</span></p>
      <p class="max-w-md text-xl font-extrabold">Decide where your group eats in minutes. Swipe together, skip the long queues, earn Makan Points.</p>
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border-[3px] border-ink bg-accent px-3 py-1 text-sm font-black">Swipe to vote</span>
        <span class="rounded-full border-[3px] border-ink bg-white px-3 py-1 text-sm font-black">Live queues</span>
        <span class="rounded-full border-[3px] border-ink bg-[#7bc96f] px-3 py-1 text-sm font-black">Hidden gems</span>
      </div>
      <RouterLink to="/" class="font-black underline">Just looking? Browse as a guest</RouterLink>

    </div>

    <!-- right: the form -->
    <form class="card flex flex-[1_1_340px] flex-col gap-3" @submit.prevent="submit">
      <p class="kicker">{{ isSignUp ? 'New player' : 'Welcome back' }}</p>
      <h1 class="page-title">{{ isSignUp ? 'Create account' : 'Log in' }}</h1>
      <p v-if="usingEmulator" class="rounded-xl border-2 border-ink bg-amber-100 p-2 text-xs">
        Local emulator: accounts only exist on this laptop and reset when the emulator stops.
      </p>
      <div><label class="label" for="email">Email</label><input id="email" v-model="email" type="email" required class="input" /></div>
      <div><label class="label" for="password">Password</label><input id="password" v-model="password" type="password" required minlength="6" class="input" /></div>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn-primary w-full font-display text-2xl font-normal" type="submit">{{ isSignUp ? 'Sign up' : 'Log in' }}</button>
      <button type="button" class="w-full font-black underline" @click="isSignUp = !isSignUp">
        {{ isSignUp ? 'Have an account? Log in' : 'New here? Create an account' }}
      </button>
      <p class="text-center text-sm font-bold">
        Run a food stall? <RouterLink to="/hawker/signup" class="font-black underline">Sell on ChopeLess</RouterLink>
      </p>
    </form>
  </div>
</template>
