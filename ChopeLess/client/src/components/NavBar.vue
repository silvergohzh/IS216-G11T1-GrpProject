<!-- Top navigation. Owner: M6 -->
<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { APP_NAME } from '../config'
// sound on/off (remembered on this device)
import { isMuted, setMuted } from '../lib/sfx'
const muted = ref(isMuted())
function toggleSound() {
  muted.value = !muted.value
  setMuted(muted.value)
}

const auth = useAuthStore()
const router = useRouter()
const open = ref(false) // mobile menu

// Everyone sees these. Logged-in users also see links for their role.
const links = computed(() => {
  const list = [
    { to: '/sessions', label: 'Makan Session' },
    { to: '/groups', label: 'Makan Kakis' },
    { to: '/queueless', label: 'QueueLess' },
    { to: '/gems', label: 'Hidden Gems' }
  ]
  if (auth.isLoggedIn) list.push({ to: '/orders', label: 'Pre-order' }, { to: '/payments', label: 'Payments' }, { to: '/points', label: 'Points' })
  if (auth.isHawker) list.push({ to: '/hawker', label: 'Order board' }, { to: '/hawker/menu', label: 'My menu' })
  if (auth.isAdmin) list.push({ to: '/admin', label: 'Admin' })
  return list
})

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <!-- Makan Quest top bar: navy, the current page is a yellow pill -->
  <header class="sticky top-0 z-[1000] border-b-4 border-[#0e1528] bg-ink text-white">
    <nav class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2 font-display text-2xl"
                  :aria-label="APP_NAME + ' home'" @click="open = false">
        <img src="/favicon.svg" alt="" class="h-8 w-8" />
        <span>Chope<span class="text-accent">Less</span></span>
      </RouterLink>

      <!-- ☰ menu button: phones and tablets (below 1024px) -->
      <button class="btn lg:hidden" :aria-expanded="open" aria-label="Menu" data-testid="menu-toggle"
              @click="open = !open">{{ open ? '✕' : '☰' }}</button>

      <!-- Links: a dropdown panel on small screens, one row from 1024px -->
      <div :class="open ? 'flex' : 'hidden'"
           class="absolute left-0 right-0 top-full flex-col gap-1 border-b-4 border-[#0e1528] bg-ink p-4
                  lg:static lg:flex lg:flex-row lg:items-center lg:gap-1 lg:border-0 lg:p-0">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to"
                    class="whitespace-nowrap rounded-xl px-3 py-2 font-extrabold text-white hover:bg-white/15"
                    active-class="!bg-accent !text-ink" @click="open = false">{{ l.label }}</RouterLink>

        <template v-if="auth.isLoggedIn">
          <RouterLink to="/profile"
                      class="max-w-[12rem] truncate whitespace-nowrap rounded-xl px-3 py-2 font-extrabold text-white hover:bg-white/15"
                      active-class="!bg-accent !text-ink" @click="open = false">
            Profile ({{ auth.user.name }})
          </RouterLink>
          <button class="btn whitespace-nowrap lg:ml-2" @click="open = false; logout()">Log out</button>
        </template>
        <RouterLink v-else to="/login" class="btn-primary whitespace-nowrap text-center lg:ml-2" @click="open = false">Log in</RouterLink>
        <!--  sound on/off -->
        <button class="btn whitespace-nowrap lg:ml-2" data-testid="sound-toggle" data-no-tap :aria-pressed="!muted"
                :aria-label="muted ? 'Turn sound on' : 'Turn sound off'" @click="toggleSound">{{ muted ? '🔇' : '🔊' }}</button>
      </div>
    </nav>
  </header>
</template>