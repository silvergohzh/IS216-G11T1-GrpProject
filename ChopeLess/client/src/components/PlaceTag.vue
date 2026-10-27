<!-- A small coloured tag that says what kind of place it is. Owner: M6
     Usage: <PlaceTag :type="place.type" />
     type: 'hawker-centre', 'food-court', 'stall' (inside a centre) or 'restaurant' (the default) -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'restaurant' }
})

const TAGS = {
  'hawker-centre': { text: 'Hawker centre', colour: 'bg-accent' },
  'food-court': { text: 'Food court', colour: 'bg-[#8fd3ff]' },
  'stall': { text: 'Stall', colour: 'bg-white' },
  'restaurant': { text: 'Restaurant', colour: 'bg-[#7bc96f]' }
}

const tag = computed(() => TAGS[props.type] || TAGS.restaurant)
</script>

<template>
  <span class="chip !text-xs" :class="tag.colour" data-testid="place-tag">{{ tag.text }}</span>
</template>
