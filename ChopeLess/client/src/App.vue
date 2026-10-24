<!-- App shell. Owner: M6 -->
<script setup>
import NavBar from './components/NavBar.vue'
import OrderAlerts from './components/OrderAlerts.vue'
</script>

<template>
  <NavBar />
  <main class="mx-auto max-w-5xl px-4 py-6">
    <RouterView />
  </main>
  <!-- Pop-ups like "Your order is ready!" (works on every page) -->
  <OrderAlerts />
</template>
