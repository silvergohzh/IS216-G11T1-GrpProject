<!-- One place, used in the swipe deck, QueueLess list and winner screen. Owner: M3 (shared) -->
<script setup>
// [SILVER] the coloured place tag (Hawker centre, Food court, Restaurant)
import PlaceTag from './PlaceTag.vue'
defineProps({
  place: { type: Object, required: true }
})
</script>

<template>
  <div class="card">
        <!-- [SILVER] place tag (hidden gems have no type: they already show HIDDEN GEM) -->
    <PlaceTag v-if="place.type" :type="place.type" />
    <h3 class="text-2xl leading-tight">{{ place.name }}</h3>
    <p class="text-sm font-bold">{{ place.cuisine }} · {{ place.address }}</p>
    <div class="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
    <div class="stat"><b class="block font-display text-lg font-normal">${{ place.priceMin }}–{{ place.priceMax }}</b>price</div>
    <div class="stat"><b class="block font-display text-lg font-normal">{{ place.walkMins ?? '–' }} min</b>walk</div>
    <div class="stat"><b class="block font-display text-lg font-normal">{{ place.waitMins ?? place.latest?.waitMins ?? '–' }} min</b>queue</div>
    </div>
      <div class="mt-2 flex flex-wrap gap-1">
      <span v-if="place.isGem" class="chip !bg-ink !text-accent">HIDDEN GEM</span>
      <span v-if="place.outside" class="chip !bg-amber-100">Slightly outside your limits</span>
      <span v-if="place.visits" class="chip !bg-brand-light">Been here {{ place.visits }}×</span>
    </div>
    <slot />
  </div>
</template>
