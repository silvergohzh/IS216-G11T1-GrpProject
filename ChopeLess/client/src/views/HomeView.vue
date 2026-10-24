
<!-- Landing page. Owner: M6 -->
<script setup>
import { APP_NAME, TAGLINE } from "../config";
import ForYou from "../components/ForYou.vue";
import MakanPoints from "./MakanPoints.vue";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
</script>

<template>
  <section class="py-8">
    <p class="label text-brand">
      {{ APP_NAME }} · {{ TAGLINE }}
    </p>

    <h1 class="text-4xl font-extrabold">
      Decide where to eat in minutes.
    </h1>

    <p class="mt-2 max-w-xl text-slate-600">
      Set your group's budget and diet, get a shortlist,
      swipe to vote, and skip the long queues.
    </p>

    <div class="mt-6 flex flex-wrap gap-3">
      <RouterLink to="/sessions" class="btn-primary">
        Start a Makan Session
      </RouterLink>

      <RouterLink to="/queueless" class="btn">
        Check queues
      </RouterLink>
    </div>

    <div class="mt-6">
      <ForYou />
    </div>

    <div class="mt-10 grid gap-4 md:grid-cols-3">
      <div class="card">
        <h3 class="font-bold">1. Set constraints</h3>
        <p class="text-sm text-slate-600">
          Everyone adds a budget and dietary needs.
        </p>
      </div>

      <div class="card">
        <h3 class="font-bold">2. Swipe &amp; vote</h3>
        <p class="text-sm text-slate-600">
          Everyone swipes. The highest score wins, otherwise ties are spun!
        </p>
      </div>

      <div class="card">
        <h3 class="font-bold">3. Skip the queue</h3>
        <p class="text-sm text-slate-600">
          AI estimates wait times so you pick a quieter spot.
        </p>
      </div>
    </div>

    <!-- Makan Points dashboard -->
    <MakanPoints v-if="auth.isLoggedIn" />
  </section>
</template>
