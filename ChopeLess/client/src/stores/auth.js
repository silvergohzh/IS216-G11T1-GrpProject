// Who is logged in. Owner: M6
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential, deleteUser
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getProfile, saveProfile, deleteProfile } from '../services/users'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) // { uid, email, name, role, placeId }
  const ready = ref(false)
  const isLoggedIn = computed(() => !!user.value)

  // Roles: 'diner' (everyone), 'hawker' (runs a stall) or 'admin'. Used by the navbar and the router.
  const isHawker = computed(() => user.value?.role === 'hawker')
  const isAdmin = computed(() => user.value?.role === 'admin')

  // Build our user object from the Firebase login + the profile saved in Firestore (users/{uid}).
  // The profile holds the display name and the role.
  async function loadUser(fbUser) {
    if (!fbUser) return null
    const profile = (await getProfile(fbUser.uid)) || {}
    return {
      uid: fbUser.uid,
      email: fbUser.email,
      name: profile.name || fbUser.email.split('@')[0],
      role: profile.role || 'diner',
      placeId: profile.placeId || null // only hawkers have this: the stall they run
    }
  }

  // Runs once when the app starts and waits for Firebase to say who is logged in
  let started = null
  function init() {
    started ??= new Promise(resolve => {
      onAuthStateChanged(auth, async fbUser => {
        user.value = await loadUser(fbUser)
        ready.value = true
        resolve()
      })
    })
    return started
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    user.value = await loadUser(cred.user)
  }

  async function register(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    user.value = await loadUser(cred.user)
    // Create a starter profile so the session page can pre-fill budget and diet
    await saveProfile(cred.user.uid, { name: email.split('@')[0], defaultBudget: 8, dietary: [] })
  }

  // Load the profile again, e.g. right after an admin approves you as a hawker,
  // so the new role (and its menu links) shows up without reloading the page
  async function refreshUser() {
    user.value = await loadUser(auth.currentUser)
  }

  async function logout() {
    await signOut(auth)
    user.value = null
  }

  // Firebase only lets you delete an account you logged in to recently, so check the password again first.
  // The profile goes before the login, because firestore.rules needs you logged in to delete it.
  async function deleteAccount(password) {
    const fbUser = auth.currentUser
    await reauthenticateWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, password))
    await deleteProfile(fbUser.uid)
    await deleteUser(fbUser)
    user.value = null
  }

  return { user, ready, isLoggedIn, isHawker, isAdmin, init, login, register, refreshUser, logout, deleteAccount }
})
