<!-- Loading screen: a little boat sailing to the island while the app starts. Owner: M3
     App.vue shows it until the first page is ready. -->
<script setup>
const TIPS = ['Sailing to Bras Basah…', 'Counting the queues…', 'Warming up the wok…', 'Polishing the capsules…']
const tip = TIPS[Math.floor(Math.random() * TIPS.length)]
</script>

<template>
  <div class="loading-sea fixed inset-0 z-[3000] grid place-items-center" role="status" aria-label="Loading ChopeLess" data-testid="loading-screen">
    <div class="flex flex-col items-center gap-5">
      <div class="relative h-36 w-64" aria-hidden="true">
        <!-- the island -->
        <div class="absolute bottom-4 left-1/2 h-20 w-52 -translate-x-1/2 rounded-[50%] border-4 border-ink bg-[#f6e7b8]"></div>
        <div class="absolute bottom-8 left-1/2 h-12 w-36 -translate-x-1/2 rounded-[50%] bg-[#7bc96f]"></div>
        <!-- the boat -->
        <svg class="boat absolute bottom-0 left-0 h-16 w-16" viewBox="0 0 64 64">
          <path d="M8 40h48l-8 14H16z" fill="#ff7a45" stroke="#17213b" stroke-width="4" stroke-linejoin="round" />
          <path d="M32 8v32" stroke="#17213b" stroke-width="4" />
          <path d="M34 10l16 26H34z" fill="#fff" stroke="#17213b" stroke-width="4" stroke-linejoin="round" />
        </svg>
      </div>
      <p class="font-display text-5xl text-white [-webkit-text-stroke:2px_#17213b] [text-shadow:0_5px_0_#17213b]">
        Chope<span class="text-accent">Less</span>
      </p>
      <!-- three bouncing capsules -->
      <div class="flex gap-3" aria-hidden="true">
        <span v-for="(c, i) in ['#ffd23f', '#ff7a45', '#7bc96f']" :key="c" class="capsule h-6 w-6 rounded-full border-[3px] border-ink"
              :style="{ background: `linear-gradient(180deg, ${c} 50%, #fff 50%)`, animationDelay: i * 0.15 + 's' }"></span>
      </div>
      <p class="font-black">{{ tip }}</p>
    </div>
  </div>
</template>

<style scoped>
/* same sea as the page background */
.loading-sea {
  background-color: var(--color-sea);
  background-image: radial-gradient(circle at 12px 12px, rgb(255 255 255 / 0.45) 2px, transparent 3px);
  background-size: 48px 48px;
}
@keyframes sail { 0% { transform: translateX(0) rotate(-4deg) } 50% { transform: translateX(80px) rotate(4deg) } 100% { transform: translateX(0) rotate(-4deg) } }
@keyframes bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
.boat { animation: sail 2.4s ease-in-out infinite }
.capsule { animation: bounce .8s ease-in-out infinite }
</style>