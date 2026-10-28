import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { sfx } from './lib/sfx'
document.addEventListener('click', e => {
  const button = e.target.closest('button, .btn, .btn-primary, .btn-danger')
  if (button && !button.closest('.vote-btn, [data-no-tap]')) sfx.tap()
}, true)


createApp(App).use(createPinia()).use(router).mount('#app')
