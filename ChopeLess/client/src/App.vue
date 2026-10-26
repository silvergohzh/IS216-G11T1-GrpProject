<!-- App shell. Owner: M6 -->
<script setup>
import NavBar from './components/NavBar.vue'
import OrderAlerts from './components/OrderAlerts.vue'
import ApplicationNotice from './components/ApplicationNotice.vue'
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
</template>
