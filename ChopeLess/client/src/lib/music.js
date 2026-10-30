// Background music: "Island Morning", an original tune made in code. Owner: M3
// No music files: every note is played by the browser's Web Audio API, so there is nothing to download or credit.
// - It follows the one 🔊 button in the top bar: sound on = effects + music, 🔇 off = silence.
// - Browsers only allow sound after a tap, so it starts on your first click (main.js).
// - It pauses while the tab is hidden.
import { isMuted } from './sfx'

const VOLUME = 0.35          // quiet, so it stays in the background
const BPM = 112
const SWING = 0.16           // a little bounce: long-short eighth notes

let ctx = null
let out = null               // the music's own volume knob
let timer = null             // the scheduler (null = not playing)
let nextTime = 0
let step = 0

// Music plays whenever sound is on
export const musicWanted = () => !isMuted()
export const isPlaying = () => timer !== null

// ---------- the notes ----------
// MIDI note numbers (60 = middle C). 8 bars x 8 eighth notes. Chords: C  Am  F  G (twice).
const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]
const _ = null
const MELODY = [
  76, _, 79, _, 81, 79, 76, _,   74, _, 76, _, 72, _, _, _,
  72, _, 74, 76, _, 79, _, 76,   74, _, _, _, 71, _, 74, _,
  79, _, 81, _, 84, 81, 79, _,   76, _, 79, _, 76, 74, 72, _,
  74, 76, _, 79, _, 76, 74, _,   72, _, _, _, _, _, 67, _
]
const hz = note => 440 * Math.pow(2, (note - 69) / 12)

// One note that fades out (like a plucked or struck instrument)
function voice(t, freq, { wave = 'sine', decay = 0.3, volume = 0.1 } = {}) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = wave
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  osc.connect(gain).connect(out)
  osc.start(t)
  osc.stop(t + decay + 0.05)
}
const marimba = (t, n) => { voice(t, hz(n), { decay: 0.45, volume: 0.09 }); voice(t, hz(n) * 4, { decay: 0.08, volume: 0.02 }) }
const pluck = (t, n) => voice(t, hz(n), { wave: 'triangle', decay: 0.2, volume: 0.05 })
const bass = (t, n) => voice(t, hz(n), { decay: 0.5, volume: 0.12 })

// What plays on each eighth note
function playStep(s, t) {
  const bar = Math.floor(s / 8) % 4
  const beat = s % 8
  const chord = CHORDS[bar]
  if (beat === 0 || beat === 4) bass(t, chord[0] - 12)          // bass on beats 1 and 3
  if (beat % 2 === 1) pluck(t, chord[(beat >> 1) % 3] + 12)     // plucked chord notes in between
  if (MELODY[s]) marimba(t, MELODY[s])                          // the tune
}

// Look a little ahead and book the next notes, so the rhythm stays even
function schedule() {
  const eighth = 60 / BPM / 2
  while (nextTime < ctx.currentTime + 0.25) {
    playStep(step % MELODY.length, nextTime)
    nextTime += eighth * (step % 2 === 0 ? 1 + SWING : 1 - SWING)
    step++
  }
}

// ---------- start / stop ----------
export function startMusic() {
  if (timer || isMuted()) return
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return
  if (!ctx) {
    ctx = new AudioCtx()
    out = ctx.createGain()
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  out.gain.cancelScheduledValues(ctx.currentTime)
  out.gain.setValueAtTime(0.0001, ctx.currentTime)
  out.gain.exponentialRampToValueAtTime(VOLUME, ctx.currentTime + 1)   // fade in over 1 s
  step = 0
  nextTime = ctx.currentTime + 0.1
  schedule()
  timer = setInterval(schedule, 40)
}

export function stopMusic() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08)             // quick fade out
}

// Pause while the tab is hidden (browsers slow down timers there, which would make it stutter)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMusic()
  else if (musicWanted() && ctx) startMusic()   // only if it was already started by a click
})