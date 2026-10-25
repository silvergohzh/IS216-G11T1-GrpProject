<!-- Countdown to the pickup deadline, e.g. "12:34 left to collect". Owner: M6
     Usage: <PickupTimer :pickup-by="order.pickupBy" />   (pickupBy is a time in milliseconds) -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  pickupBy: { type: Number, required: true }
})

// "now" ticks every second, so the countdown updates by itself
const now = ref(Date.now())
let ticker = null
onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => clearInterval(ticker))

const secondsLeft = computed(() => Math.max(0, Math.round((props.pickupBy - now.value) / 1000)))
const isLate = computed(() => secondsLeft.value === 0)

// 754 seconds -> "12:34"
const timeLeft = computed(() => {
  const minutes = Math.floor(secondsLeft.value / 60)
  const seconds = secondsLeft.value % 60
  return minutes + ':' + String(seconds).padStart(2, '0')
})
</script>

<template>
  <p v-if="isLate" class="font-bold text-red-600" data-testid="pickup-timer">Pickup time is over. Please collect it now!</p>
  <p v-else class="font-bold text-brand" data-testid="pickup-timer">{{ timeLeft }} left to collect</p>
</template>
