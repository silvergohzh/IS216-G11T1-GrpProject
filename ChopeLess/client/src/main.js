import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
// [M3] START: a water-droplet sound whenever a button is pressed
// (not vote buttons: they have their own sounds; not links: changing page plays the bubble sound instead)
import { sfx } from './lib/sfx'
import { musicWanted, isPlaying, startMusic } from './lib/music'
document.addEventListener('click', e => {
  const button = e.target.closest('button, .btn, .btn-primary, .btn-danger')
  if (button && button.tagName !== 'A' && !button.closest('.vote-btn, [data-no-tap]')) sfx.tap()
  // Sound on? Browsers only allow sound after a tap, so the music starts on the first click
  if (musicWanted() && !isPlaying()) startMusic()
}, true)
// [M3] END


createApp(App).use(createPinia()).use(router).mount('#app')
