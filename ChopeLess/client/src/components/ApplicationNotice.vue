<!-- A notice at the top of every page about my hawker application. Owner: M6
     - Rejected: says why, with a button to fix it and apply again.
     - Approved: unlocks the hawker pages straight away (no reload needed).
     It watches the application live, so the notice appears the moment the admin decides. -->
<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { watchMyApplication } from '../services/hawkers'
import { sendNotification } from '../lib/notify'

const auth = useAuthStore()
const router = useRouter()
const application = ref(null)   // my application, or null
const hidden = ref(false)       // true after I tap "Dismiss" (comes back on the next visit)
let lastStatus = null
let stopWatching = null

// Start watching whenever someone logs in (hawkers already have their stall, so skip them)
watch(() => auth.user?.uid, uid => {
  if (stopWatching) stopWatching()
  stopWatching = null
  application.value = null
  lastStatus = null
  if (!uid || auth.isHawker) return

  stopWatching = watchMyApplication(uid, async data => {
    application.value = data
    const status = data ? data.status : null

    // The admin just decided while I'm on the site: also send a browser notification
    if (lastStatus === 'pending' && status === 'rejected') {
      sendNotification('ChopeLess', `Your stall application was not approved: ${data.reason}`)
    }
    if (lastStatus === 'pending' && status === 'approved') {
      sendNotification('ChopeLess', `Your stall ${data.stallName} is approved! You can now add your menu.`)
    }
    // Approved: load my profile again so the hawker links (Order board, My menu) appear now
    if (status === 'approved' && !auth.isHawker) await auth.refreshUser()

    if (status !== lastStatus) hidden.value = false // a new decision always shows, even if I dismissed an older one
    lastStatus = status
  })
}, { immediate: true })

onUnmounted(() => {
  if (stopWatching) stopWatching()
})

function goToMenu() {
  hidden.value = true
  router.push('/hawker/menu')
}
</script>

<template>
  <div v-if="application && !hidden" class="mx-auto max-w-5xl px-4 pt-4">
    <!-- Rejected -->
    <div v-if="application.status === 'rejected'" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"
         role="alert" data-testid="application-notice">
      <div>
        <p class="font-bold text-red-700">Your stall application was not approved</p>
        <p class="text-sm text-red-700">"{{ application.stallName }}": {{ application.reason }}</p>
      </div>
      <div class="flex gap-2">
        <RouterLink to="/hawker/signup" class="btn-danger text-sm">Fix and apply again</RouterLink>
        <button class="btn text-sm" @click="hidden = true">Dismiss</button>
      </div>
    </div>

    <!-- Approved -->
    <div v-else-if="application.status === 'approved'" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand bg-brand-light p-4"
         role="status" data-testid="application-notice">
      <div>
        <p class="font-bold text-brand">Your stall is approved! 🎉</p>
        <p class="text-sm">"{{ application.stallName }}" is now live. Add your menu so diners can order.</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary text-sm" @click="goToMenu">Set up my menu</button>
        <button class="btn text-sm" @click="hidden = true">Dismiss</button>
      </div>
    </div>

    <!-- Waiting -->
    <div v-else-if="application.status === 'pending'" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
         data-testid="application-notice">
      <p>Your stall application for "{{ application.stallName }}" is waiting for an admin. We'll show the decision here.</p>
      <button class="btn text-xs" @click="hidden = true">Dismiss</button>
    </div>
  </div>
</template>
