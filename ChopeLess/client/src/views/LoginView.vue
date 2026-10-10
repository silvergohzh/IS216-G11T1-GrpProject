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
  <form class="card mx-auto max-w-sm space-y-3" @submit.prevent="submit">
    <h1 class="page-title">{{ isSignUp ? 'Create account' : 'Log in' }}</h1>
    <p v-if="usingEmulator" class="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
      Local emulator: accounts only exist on this laptop and reset when the emulator stops.
    </p>
    <div><label class="label" for="email">Email</label><input id="email" v-model="email" type="email" required class="input" /></div>
    <div><label class="label" for="password">Password</label><input id="password" v-model="password" type="password" required minlength="6" class="input" /></div>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn-primary w-full" type="submit">{{ isSignUp ? 'Sign up' : 'Log in' }}</button>
    <button type="button" class="w-full text-sm text-brand" @click="isSignUp = !isSignUp">
      {{ isSignUp ? 'Have an account? Log in' : 'New here? Create an account' }}
    </button>
  </form>
</template>
