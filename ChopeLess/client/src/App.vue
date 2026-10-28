<!-- App shell. Owner: M6 -->
<script setup>
import NavBar from './components/NavBar.vue'
import OrderAlerts from './components/OrderAlerts.vue'
import ApplicationNotice from './components/ApplicationNotice.vue'
// [SILVER] START: loading screen while the app starts (checking who is logged in + loading the first page)
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import LoadingScreen from './components/LoadingScreen.vue'

const router = useRouter()
const booting = ref(true)
// router.isReady() waits for the first page (and the login check in router/index.js).
// Keep the boat on screen for at least 0.6 s so it doesn't just flash.
router.isReady().finally(() => setTimeout(() => (booting.value = false), 700))
// [SILVER] END

</script>

<template>
  <NavBar />
  <!-- "Your stall application was approved / not approved" (shows on every page) -->
  <ApplicationNotice />
  <main class="mx-auto max-w-6xl px-4 py-6">
    <RouterView />
  </main>
  <!-- Pop-ups like "Your order is ready!" (works on every page) -->
  <OrderAlerts />
    <!-- [SILVER] loading screen: fades out once the first page is ready -->
  <Transition name="fade">
    <LoadingScreen v-if="booting" />
  </Transition>
</template>
<style>
/* [SILVER] fade for the loading screen */
.fade-leave-active { transition: opacity .4s ease; pointer-events: none; }
.fade-leave-to { opacity: 0; }
</style>
