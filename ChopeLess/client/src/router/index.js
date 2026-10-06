// All pages and who owns them. Owner: M6 (guards). Add your route here when you add a page.
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { APP_NAME } from '../config'

const routes = [
  // M6: Foundation
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: 'Log in' } },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true, title: 'Profile' } },

  // M3: Session front-end
  { path: '/sessions', name: 'sessions', component: () => import('../views/SessionsView.vue'), meta: { requiresAuth: true, title: 'Makan Session' } },
  { path: '/sessions/:code', name: 'lobby', component: () => import('../views/LobbyView.vue'), meta: { requiresAuth: true, title: 'Lobby' } },
  { path: '/sessions/:code/vote', name: 'vote', component: () => import('../views/VoteView.vue'), meta: { requiresAuth: true, title: 'Vote' } },
  { path: '/sessions/:code/winner', name: 'winner', component: () => import('../views/WinnerView.vue'), meta: { requiresAuth: true, title: 'Winner' } },

  // M4: QueueLess
  { path: '/queueless', name: 'queueless', component: () => import('../views/QueueLessView.vue'), meta: { title: 'QueueLess' } },
  { path: '/places/:id', name: 'place', component: () => import('../views/PlaceDetailView.vue'), meta: { title: 'Place' } },

  // M5: Hidden Gems
  { path: '/gems', name: 'gems', component: () => import('../views/GemsView.vue'), meta: { title: 'Hidden Gems' } }
]

const router = createRouter({ history: createWebHistory(), routes })

// Send logged-out users to the login page
router.beforeEach(async to => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()
  if (to.meta.requiresAuth && !auth.isLoggedIn) return { name: 'login', query: { next: to.fullPath } }
})

// Browser tab title, e.g. "QueueLess · ChopeLess"
router.afterEach(to => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
})

export default router
