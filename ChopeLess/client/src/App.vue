<!-- App shell. Owner: M6 -->
<script setup>
import NavBar from './components/NavBar.vue'
</script>

<template>
  <NavBar />
  <main class="mx-auto max-w-5xl px-4 py-6">
    <RouterView />
  </main>
</template>
