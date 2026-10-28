<!-- A small coloured tag that says what kind of place it is. Owner: M6
     Usage: <PlaceTag :type="place.type" />
     type: 'hawker-centre', 'food-court', 'stall' (inside a centre) or 'restaurant' (the default) -->
<!-- [SILVER] this whole component (the coloured place tags) -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'restaurant' }
})

// Makan Quest colours: each type has its own colour, so the tags stand out on the blue sea
const TAGS = {
  'hawker-centre': { text: 'Hawker centre', colour: 'bg-accent' },      // sun yellow
  'food-court': { text: 'Food court', colour: 'bg-coral' },             // orange
  'stall': { text: 'Stall', colour: 'bg-sky' },                         // pale blue
  'restaurant': { text: 'Restaurant', colour: 'bg-[#7bc96f]' }          // grass green
}

const tag = computed(() => TAGS[props.type] || TAGS.restaurant)
</script>

<template>
  <!-- Capital letters and a little dot, like the HIDDEN GEM and HOST chips -->
  <span class="chip uppercase tracking-wide" :class="tag.colour" data-testid="place-tag">
    <span class="h-2 w-2 rounded-full border border-ink bg-white" aria-hidden="true"></span>{{ tag.text }}
  </span>
</template>
