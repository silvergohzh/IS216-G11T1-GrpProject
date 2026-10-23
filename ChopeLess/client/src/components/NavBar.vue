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
  { to: '/groups', label: 'Makan Kakis' }, 
  { to: '/queueless', label: 'QueueLess' },
  { to: '/gems', label: 'Hidden Gems' }
]

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header class="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur">
    <nav class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2 text-xl font-extrabold"
                  :aria-label="APP_NAME + ' home'" @click="open = false">
        <img src="/favicon.svg" alt="" class="h-7 w-7" />
        <span>Chope<span class="text-brand">Less</span></span>
      </RouterLink>

      <!-- ☰ menu button: phones and tablets (below 1024px) -->
      <button class="btn lg:hidden" :aria-expanded="open" aria-label="Menu" data-testid="menu-toggle"
              @click="open = !open">{{ open ? '✕' : '☰' }}</button>

      <!-- Links: a dropdown panel on small screens, one row from 1024px -->
      <div :class="open ? 'flex' : 'hidden'"
           class="absolute left-0 right-0 top-full flex-col gap-1 border-b border-slate-200 bg-white p-4 shadow-lg
                  lg:static lg:flex lg:flex-row lg:items-center lg:gap-6 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to"
                    class="whitespace-nowrap rounded-lg px-2 py-2 font-semibold text-slate-600 hover:text-brand lg:p-0"
                    active-class="text-brand" @click="open = false">{{ l.label }}</RouterLink>

        <template v-if="auth.isLoggedIn">
          <RouterLink to="/profile"
                      class="max-w-[12rem] truncate whitespace-nowrap rounded-lg px-2 py-2 font-semibold text-slate-600 hover:text-brand lg:p-0"
                      active-class="text-brand" @click="open = false">
            Profile ({{ auth.user.name }})
          </RouterLink>
          <button class="btn whitespace-nowrap" @click="open = false; logout()">Log out</button>
        </template>
        <RouterLink v-else to="/login" class="btn-primary whitespace-nowrap text-center" @click="open = false">Log in</RouterLink>
      </div>
    </nav>
  </header>
</template>
