<!-- One place, used in the swipe deck, QueueLess list and winner screen. Owner: M3 (shared) -->
<script setup>
defineProps({
  place: { type: Object, required: true }
})
</script>

<template>
  <div class="card">
    <h3 class="text-lg font-bold">{{ place.name }}</h3>
    <p class="text-sm text-slate-500">{{ place.cuisine }} · {{ place.address }}</p>
    <div class="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
      <div class="rounded-lg bg-slate-100 p-2"><b class="block">${{ place.priceMin }}–{{ place.priceMax }}</b>price</div>
      <div class="rounded-lg bg-slate-100 p-2"><b class="block">{{ place.walkMins ?? '–' }} min</b>walk</div>
      <div class="rounded-lg bg-slate-100 p-2"><b class="block">{{ place.waitMins ?? place.latest?.waitMins ?? '–' }} min</b>queue</div>
    </div>
    <span v-if="place.isGem" class="mt-2 inline-block rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold">Hidden gem</span>
    <slot />
  </div>
</template>
