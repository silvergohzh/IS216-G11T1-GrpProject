<!-- Home: the Makan Quest island. Owner: M3 (layout) / M6 (route)
         1. Quick actions for the main jobs  2. The island map + Today's Quests  3. This week's top 5  4. For You -->
<script setup>
import IslandMap from "../components/IslandMap.vue";
import ForYou from "../components/ForYou.vue";
import HomeLeaderboard from "../components/HomeLeaderboard.vue";
import { useAuthStore } from "../stores/auth";


const auth = useAuthStore();
</script>

<template>
  <div class="flex flex-col gap-10 py-4">
    <!-- the two things most people come for, always one tap away -->
    <div class="flex flex-wrap gap-3">
      <RouterLink to="/sessions" class="btn-primary font-display text-xl font-normal">Start a Makan Session</RouterLink>
      <RouterLink to="/sessions" class="btn">Join with a code</RouterLink>
      <RouterLink to="/queueless" class="btn">Check queues</RouterLink>
      <RouterLink v-if="!auth.isLoggedIn" to="/login" class="btn">Log in to earn Makan Points</RouterLink>
    </div>

    <HomeLeaderboard />
    <IslandMap />
        <!-- this week's top 5 (the full board is on the Makan Points page) -->


    <ForYou />
  </div>
</template>
