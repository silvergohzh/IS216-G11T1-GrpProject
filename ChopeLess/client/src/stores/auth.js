// Who is logged in. Owner: M6
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { saveProfile } from '../services/users'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) // { uid, email, name }
  const ready = ref(false)
  const isLoggedIn = computed(() => !!user.value)

  const toUser = fbUser => (fbUser ? { uid: fbUser.uid, email: fbUser.email, name: fbUser.email.split('@')[0] } : null)

  // Runs once when the app starts and waits for Firebase to say who is logged in
  let started = null
  function init() {
    started ??= new Promise(resolve => {
      onAuthStateChanged(auth, fbUser => {
        user.value = toUser(fbUser)
        ready.value = true
        resolve()
      })
    })
    return started
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    user.value = toUser(cred.user)
  }

  async function register(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    user.value = toUser(cred.user)
    // Create a starter profile so the session page can pre-fill budget and diet
    await saveProfile(cred.user.uid, { name: email.split('@')[0], defaultBudget: 8, dietary: [] })
  }

  async function logout() {
    await signOut(auth)
    user.value = null
  }

  return { user, ready, isLoggedIn, init, login, register, logout }
})
