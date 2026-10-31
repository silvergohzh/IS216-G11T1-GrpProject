<!-- Top navigation. Owner: M6 -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { APP_NAME } from '../config'
// [M3] one sound button: on = button sounds + music, off = silence (remembered on this device)
import { isMuted, setMuted } from '../lib/sfx'
import { startMusic, stopMusic } from '../lib/music'
const muted = ref(isMuted())
function toggleSound() {
  muted.value = !muted.value
  setMuted(muted.value)
  if (muted.value) stopMusic()
  else startMusic()
}

const auth = useAuthStore()
const router = useRouter()
const open = ref(false)      // phone/tablet menu (☰)
const account = ref(null)    // [M3] the desktop "account" dropdown (<details>)

// Everyone sees these. Logged-in users also see links for their role.
const links = computed(() => {
  const list = [
    { to: '/sessions', label: 'Makan Session' },
    { to: '/groups', label: 'Makan Kakis' },
    { to: '/queueless', label: 'QueueLess' },
    { to: '/gems', label: 'Hidden Gems' }
  ]
  if (auth.isLoggedIn) list.push({ to: '/orders', label: 'Pre-order' })
  return list
})

// [M3] Account links: on a laptop they sit in a small dropdown under your name,
// so the top bar never gets wider than the screen (hawkers and admins have extra links).
// On phones and tablets they are listed in the ☰ menu as before.
const accountLinks = computed(() => {
  const list = [{ to: '/points', label: 'Points' }, { to: '/payments', label: 'Payments' }]
  if (auth.isHawker) list.push({ to: '/hawker', label: 'Order board' }, { to: '/hawker/menu', label: 'My menu' })
  if (auth.isAdmin) list.push({ to: '/admin', label: 'Admin' })
  list.push({ to: '/profile', label: 'Profile' })
  return list
})

// Close both menus after choosing a link
function closeMenus() {
  open.value = false
  if (account.value) account.value.open = false
}

// [M3] clicking anywhere outside the dropdown closes it
function onPageClick(e) {
  if (account.value?.open && !account.value.contains(e.target)) account.value.open = false
}
onMounted(() => document.addEventListener('click', onPageClick))
onUnmounted(() => document.removeEventListener('click', onPageClick))

async function logout() {
  closeMenus()
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <!-- Makan Quest top bar: navy, the current page is a yellow pill -->
  <header class="sticky top-0 z-[1000] border-b-4 border-[#0e1528] bg-ink text-white">
    <nav class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <!-- [M3] logo: a rubber stamp, slightly slanted, about to "chope" the name ChopeLess -->
      <RouterLink to="/" class="relative flex shrink-0 flex-col items-center font-display leading-none"
                  :aria-label="APP_NAME + ' home'" @click="closeMenus">
        <img src="/chop.svg" alt="" class="-mb-1 h-10 w-10 -rotate-12" />
        <span class="text-2xl">Chope<span class="text-accent">Less</span></span>
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
                    active-class="!bg-accent !text-ink" @click="closeMenus">{{ l.label }}</RouterLink>

        <template v-if="auth.isLoggedIn">
          <!-- [M3] phones/tablets: account links listed in the ☰ menu -->
          <RouterLink v-for="l in accountLinks" :key="'m' + l.to" :to="l.to"
                      class="whitespace-nowrap rounded-xl px-3 py-2 font-extrabold text-white hover:bg-white/15 lg:hidden"
                      active-class="!bg-accent !text-ink" @click="closeMenus">{{ l.label }}</RouterLink>
          <button class="btn whitespace-nowrap lg:hidden" @click="logout">Log out</button>

          <!-- [M3] laptops: account links in a dropdown under your name, so the bar always fits -->
          <details ref="account" class="relative hidden lg:ml-2 lg:block">
            <summary class="flex max-w-[8rem] cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-xl
                            border-2 border-white/40 px-3 py-2 font-extrabold hover:bg-white/15 [&::-webkit-details-marker]:hidden">
              <span class="truncate">{{ auth.user.name || 'Account' }}</span> <span aria-hidden="true">▾</span>
            </summary>
            <div class="absolute right-0 top-full mt-3 flex w-52 flex-col gap-1 rounded-2xl border-4 border-[#0e1528] bg-ink p-3
                        shadow-[0_6px_0_#0e1528]">
              <RouterLink v-for="l in accountLinks" :key="'d' + l.to" :to="l.to"
                          class="whitespace-nowrap rounded-xl px-3 py-2 font-extrabold text-white hover:bg-white/15"
                          active-class="!bg-accent !text-ink" @click="closeMenus">{{ l.label }}</RouterLink>
              <button class="btn mt-1 whitespace-nowrap" @click="logout">Log out</button>
            </div>
          </details>
        </template>
        <RouterLink v-else to="/login" class="btn-primary whitespace-nowrap text-center lg:ml-2" @click="closeMenus">Log in</RouterLink>
        <!--  sound on/off -->
        <button class="btn whitespace-nowrap lg:ml-2" data-testid="sound-toggle" data-no-tap :aria-pressed="!muted"
                :aria-label="muted ? 'Turn sound on' : 'Turn sound off'" @click="toggleSound">{{ muted ? '🔇' : '🔊' }}</button>
      </div>
    </nav>
  </header>
</template>