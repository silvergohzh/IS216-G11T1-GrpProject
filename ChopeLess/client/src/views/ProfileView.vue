<!-- Profile: default budget and dietary needs. Owner: M6 (Firestore users/{uid}) -->
<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { getProfile, saveProfile } from '../services/users'

const auth = useAuthStore()
const DIETS = ['halal', 'vegetarian', 'no-beef']
const form = ref({ name: auth.user?.name || '', defaultBudget: 8, dietary: [] })
const message = ref('')
const error = ref('')

onMounted(async () => {
  const me = await getProfile(auth.user.uid)
  if (me) form.value = { ...form.value, ...me }
})

async function save() {
  error.value = ''
  try {
    await saveProfile(auth.user.uid, form.value)
    message.value = 'Profile saved'
    setTimeout(() => (message.value = ''), 2000)
  } catch (err) { error.value = err.message }
}
</script>

<template>
  <form class="card max-w-md space-y-4" @submit.prevent="save">
    <h1 class="page-title">Your profile</h1>
    <div><label class="label" for="name">Display name</label><input id="name" v-model="form.name" required class="input" /></div>
    <div><label class="label" for="budget">Default budget ($)</label><input id="budget" v-model.number="form.defaultBudget" type="number" min="1" class="input" /></div>
    <fieldset>
      <legend class="label">Dietary needs</legend>
      <label v-for="d in DIETS" :key="d" class="mr-4 inline-flex items-center gap-1">
        <input type="checkbox" :value="d" v-model="form.dietary" /> {{ d }}
      </label>
    </fieldset>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="flex items-center gap-3">
      <button class="btn-primary" type="submit">Save</button>
      <span v-if="message" class="text-sm font-semibold text-brand">{{ message }}</span>
    </div>
    <!-- TODO (M6): "Delete account" button: deleteProfile(uid), then delete the Firebase Auth user -->
  </form>
</template>
