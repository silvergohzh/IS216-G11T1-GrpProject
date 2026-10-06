<!-- Top navigation. Owner: M6 -->
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { APP_NAME } from '../config'

const auth = useAuthStore()
const router = useRouter()
const open = ref(false) // mobile menu

const links = [
  { to: '/sessions', label: 'Makan Session' },
  { to: '/queueless', label: 'QueueLess' },
  { to: '/gems', label: 'Hidden Gems' }
]

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
      <RouterLink to="/" class="flex items-center gap-2 text-xl font-extrabold" :aria-label="APP_NAME + ' home'">
        <img src="/favicon.svg" alt="" class="h-7 w-7" />
        <span>Chope<span class="text-brand">Less</span></span>
      </RouterLink>

      <button class="btn md:hidden" @click="open = !open" aria-label="Menu" data-testid="menu-toggle">☰</button>

      <div :class="open ? 'flex' : 'hidden'"
           class="absolute left-0 right-0 top-14 z-[1000] flex-col gap-2 border-b border-slate-200 bg-white p-4 md:static md:flex md:flex-row md:items-center md:gap-4 md:border-0 md:p-0">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="font-semibold text-slate-600 hover:text-brand"
                    active-class="text-brand" @click="open = false">{{ l.label }}</RouterLink>
        <template v-if="auth.isLoggedIn">
          <RouterLink to="/profile" class="font-semibold text-slate-600" @click="open = false">{{ auth.user.name }}</RouterLink>
          <button class="btn" @click="logout">Log out</button>
        </template>
        <RouterLink v-else to="/login" class="btn-primary text-center" @click="open = false">Log in</RouterLink>
      </div>
    </nav>
  </header>
</template>
