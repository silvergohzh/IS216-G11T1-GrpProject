<!-- Profile: default budget and dietary needs. Owner: M6 (Firestore users/{uid}) -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getProfile, saveProfile } from '../services/users'

const auth = useAuthStore()
const router = useRouter()
const DIETS = ['halal', 'vegetarian', 'no-beef']
const form = ref({ name: auth.user?.name || '', defaultBudget: 8, dietary: [] })
const message = ref('')
const error = ref('')
const loaded = ref(false) // the form stays disabled until then, so the saved profile can't overwrite what you typed

onMounted(async () => {
  try {
    const me = await getProfile(auth.user.uid)
    if (me) form.value = { ...form.value, ...me }
  } catch (err) { error.value = err.message }
  finally { loaded.value = true }
})

async function save() {
  error.value = ''
  try {
    await saveProfile(auth.user.uid, form.value)
    message.value = 'Profile saved'
    setTimeout(() => (message.value = ''), 2000)
  } catch (err) { error.value = err.message }
}

// Delete account: ask for the password again, then remove the profile and the login
const confirming = ref(false)
const deletePassword = ref('')
const deleteError = ref('')
const deleting = ref(false)

const deleteMessages = {
  'auth/invalid-credential': 'Wrong password.',
  'auth/wrong-password': 'Wrong password.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.'
}

function cancelDelete() {
  confirming.value = false
  deletePassword.value = ''
  deleteError.value = ''
}

async function deleteAccount() {
  deleteError.value = ''
  deleting.value = true
  try {
    await auth.deleteAccount(deletePassword.value)
    router.push('/')
  } catch (err) {
    deleteError.value = deleteMessages[err.code] || err.message
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="max-w-md space-y-4">
    <form class="card space-y-4" @submit.prevent="save">
      <h1 class="page-title">Your profile</h1>
      <fieldset :disabled="!loaded" class="space-y-4">
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
      </fieldset>
    </form>

    <section class="card space-y-3">
      <h2 class="font-bold text-red-700">Delete account</h2>
      <p class="text-sm text-slate-600">This removes your profile and login for good. It cannot be undone.</p>
      <button v-if="!confirming" class="btn text-red-700" type="button" @click="confirming = true">
        Delete account
      </button>
      <form v-else class="space-y-3" @submit.prevent="deleteAccount">
        <div>
          <label class="label" for="delete-password">Confirm with your password</label>
          <input id="delete-password" v-model="deletePassword" type="password" required autocomplete="current-password" class="input" />
        </div>
        <p v-if="deleteError" class="error">{{ deleteError }}</p>
        <div class="flex flex-wrap gap-3">
          <button class="btn-danger" type="submit" :disabled="deleting">
            {{ deleting ? 'Deleting…' : 'Delete my account' }}
          </button>
          <button class="btn" type="button" @click="cancelDelete">Cancel</button>
        </div>
      </form>
    </section>
  </div>
</template>
