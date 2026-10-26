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
  { path: '/groups', name: 'groups', component: () => import('../views/GroupsView.vue'), meta: { requiresAuth: true, title: 'Makan Kakis' } },
  { path: '/groups/:code', name: 'group', component: () => import('../views/GroupDetailView.vue'), meta: { requiresAuth: true, title: 'Group' } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { requiresAuth: true, title: 'Makan History' } },

  // M4: QueueLess
  { path: '/queueless', name: 'queueless', component: () => import('../views/QueueLessView.vue'), meta: { title: 'QueueLess' } },
  { path: '/places/:id', name: 'place', component: () => import('../views/PlaceDetailView.vue'), meta: { title: 'Place' } },

  // M1: Makan Points (moved off the Home page)
  { path: '/points', name: 'points', component: () => import('../views/MakanPoints.vue'), meta: { requiresAuth: true, title: 'Makan Points' } },

  // M5: Hidden Gems
  { path: '/gems', name: 'gems', component: () => import('../views/GemsView.vue'), meta: { title: 'Hidden Gems' } },

  // M6: Orders + Payments + Platform
  // "role" means only that role can open the page
  { path: '/orders', name: 'orders', component: () => import('../views/OrdersView.vue'), meta: { requiresAuth: true, title: 'Pre-order' } },
  { path: '/orders/:id', name: 'cart', component: () => import('../views/CartView.vue'), meta: { requiresAuth: true, title: 'Order' } },
  { path: '/hawker', name: 'hawker', component: () => import('../views/HawkerOrdersView.vue'), meta: { requiresAuth: true, role: 'hawker', title: 'Order board' } },
  { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { requiresAuth: true, role: 'admin', title: 'Admin' } },
  { path: '/hawker/signup', name: 'hawker-signup', component: () => import('../views/HawkerSignupView.vue'), meta: { title: 'Sell on ChopeLess' } },
  { path: '/hawker/menu', name: 'hawker-menu', component: () => import('../views/MenuView.vue'), meta: { requiresAuth: true, role: 'hawker', title: 'My menu' } },
  { path: '/stalls/:id', name: 'stall', component: () => import('../views/StallView.vue'), meta: { title: 'Stall' } }
]

const router = createRouter({ history: createWebHistory(), routes })

// Runs before every page change
router.beforeEach(async to => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()

  // 1. Logged out? Go to the login page first, then come back here
  if (to.meta.requiresAuth && !auth.isLoggedIn) return { name: 'login', query: { next: to.fullPath } }

  // 2. Wrong role? (e.g. a diner opening the hawker board) Go back to the home page
  if (to.meta.role && auth.user.role !== to.meta.role) return { name: 'home' }
})

// Browser tab title, e.g. "QueueLess · ChopeLess"
router.afterEach(to => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
})

export default router
