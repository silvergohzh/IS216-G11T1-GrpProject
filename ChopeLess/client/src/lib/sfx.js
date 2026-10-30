// Makan Quest sound effects. Owner: M3
// Made in the browser with the Web Audio API, so there are no sound files to download or credit.
// Usage:  import { sfx } from '../lib/sfx'   then   sfx.pop()
// The 🔊 button in the top bar mutes everything (remembered on this device).

const KEY = 'chopeless:muted'
let ctx = null

export function isMuted() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
export function setMuted(muted) {
  try { localStorage.setItem(KEY, muted ? '1' : '0') } catch { /* private mode */ }
}

// The browser's sound engine. Browsers only allow sound after the user has tapped something,
// which is always true here because every sound follows a tap.
function engine() {
  if (isMuted()) return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!ctx) ctx = new AudioCtx()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// One short beep that slides from one pitch to another and fades out
function tone({ wave = 'square', from, to = from, ms = 100, volume = 0.1, delay = 0 }) {
  const a = engine()
  if (!a) return
  const start = a.currentTime + delay / 1000
  const end = start + ms / 1000
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = wave
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(to, end)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.001, end)
  osc.connect(gain).connect(a.destination)
  osc.start(start)
  osc.stop(end + 0.02)
}

// A short "pshh" of noise (sounds like confetti bursting)
function burst({ ms = 300, volume = 0.15, delay = 0 }) {
  const a = engine()
  if (!a) return
  const length = Math.floor((a.sampleRate * ms) / 1000)
  const buffer = a.createBuffer(1, length, a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buffer
  const filter = a.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 1800
  const gain = a.createGain()
  const start = a.currentTime + delay / 1000
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + ms / 1000)
  src.connect(filter).connect(gain).connect(a.destination)
  src.start(start)
}

export const sfx = {
  // any button: a soft water droplet "plip"
  tap: () => tone({ wave: 'sine', from: 900, to: 1700, ms: 70, volume: 0.08 }),
  // changing pages: three little rising bubbles
  bubble: () => [0, 70, 150].forEach((d, i) =>
    tone({ wave: 'sine', from: 300 + i * 120, to: 900 + i * 200, ms: 100, volume: 0.1, delay: d })),
  // swipe yes: two notes going up
  yes: () => { tone({ wave: 'triangle', from: 523, ms: 80 }); tone({ wave: 'triangle', from: 784, ms: 120, delay: 70 }) },
  // swipe no / veto: a low "bwomp"
  no: () => tone({ wave: 'sawtooth', from: 300, to: 150, ms: 150, volume: 0.06 }),
  // Super Like: three sparkly notes
  star: () => [784, 988, 1319].forEach((f, i) => tone({ wave: 'triangle', from: f, ms: 90, delay: i * 60 })),
  // gacha crank: ratchet clicks
  crank: () => { for (let i = 0; i < 8; i++) tone({ from: 240, to: 180, ms: 30, volume: 0.05, delay: i * 140 }) },
  // capsule opening: a "pop"
  pop: () => tone({ wave: 'sine', from: 900, to: 180, ms: 170, volume: 0.25 }),
  // winner: a little victory tune
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) =>
    tone({ from: f, ms: i === 3 ? 420 : 120, volume: 0.07, delay: i * 110 })),
  // confetti: two bursts, at the same moments as the two confetti cannons on the winner page
  confetti: () => { burst({ ms: 350 }); burst({ ms: 280, volume: 0.1, delay: 250 }) }
}