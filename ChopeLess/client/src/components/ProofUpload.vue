<!-- Take or choose a photo as proof, then press the button. Owner: M6
     Usage: <ProofUpload button-text="Mark ready" :busy="busy" @send="photo => ..." />
     The photo is shrunk in the browser first, so it is small enough to save. -->
<script setup>
import { ref } from 'vue'
import { shrinkPhoto } from '../services/places'

defineProps({
  buttonText: { type: String, required: true },
  label: { type: String, default: 'Photo proof' },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['send'])

const photo = ref('')   // the shrunk photo, as text ("data:image/jpeg;base64,...")
const error = ref('')

async function pick(event) {
  error.value = ''
  const file = event.target.files[0]
  if (!file) return
  try {
    photo.value = await shrinkPhoto(file, 800) // at most 800px wide or tall
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <div class="space-y-2">
    <label class="label">{{ label }}</label>
    <!-- A big photo button instead of the browser's small "Choose file" box.
         The real file input is inside it, hidden: clicking the button opens it.
         capture="environment" opens the back camera on phones. -->
    <label class="btn flex w-full cursor-pointer items-center justify-center gap-2 text-sm focus-within:outline focus-within:outline-[3px] focus-within:outline-coral"
           data-testid="proof-picker">
      <span aria-hidden="true">📷</span> {{ photo ? 'Change photo' : 'Take or choose a photo' }}
      <input type="file" accept="image/*" capture="environment" class="sr-only" @change="pick" data-testid="proof-input" />
    </label>
    <img v-if="photo" :src="photo" alt="Photo preview" class="h-32 rounded-lg object-cover" />
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn-primary w-full text-sm" :disabled="!photo || busy" @click="emit('send', photo)">{{ buttonText }}</button>
    <p v-if="!photo" class="text-xs text-slate-500">Add a photo first, then press "{{ buttonText }}".</p>
  </div>
</template>
