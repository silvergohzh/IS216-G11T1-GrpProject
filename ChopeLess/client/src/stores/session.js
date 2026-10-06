// The current Makan Session, shared by the lobby, vote and winner pages. Owner: M3
// Uses a live Firestore listener, so every phone updates the moment anything changes.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { watchSession } from '../services/sessions'

export const useSessionStore = defineStore('session', () => {
  const session = ref(null)
  const error = ref('')
  let unsubscribe = null

  function watch(code) {
    stop()
    session.value = null
    error.value = ''
    unsubscribe = watchSession(code,
      data => {
        session.value = data
        if (!data) error.value = 'Session not found or it has ended'
      },
      err => { error.value = err.message })
  }

  function stop() {
    if (unsubscribe) unsubscribe()
    unsubscribe = null
  }

  return { session, error, watch, stop }
})
