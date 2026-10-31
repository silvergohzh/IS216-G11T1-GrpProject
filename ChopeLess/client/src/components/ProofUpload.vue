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
    <!-- capture="environment" opens the back camera on phones -->
    <input type="file" accept="image/*" capture="environment" class="text-sm" @change="pick" data-testid="proof-input" />
    <img v-if="photo" :src="photo" alt="Photo preview" class="h-32 rounded-lg object-cover" />
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn-primary text-sm" :disabled="!photo || busy" @click="emit('send', photo)">{{ buttonText }}</button>
  </div>
</template>
