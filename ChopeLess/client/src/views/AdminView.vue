<!-- Admin: see every account and change roles. Owner: M6 -->
<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'
import { listPlaces } from '../services/places'

const users = ref([])
const places = ref([])
const error = ref('')
const savedUid = ref('') // shows "Saved" next to the row that was just saved

onMounted(async () => {
  try {
    users.value = await api('/admin/users')
    places.value = await listPlaces()
  } catch (err) {
    error.value = err.message
  }
})

// Send the new role (and stall, for hawkers) to the server
async function save(user) {
  error.value = ''
  try {
    await api(`/admin/users/${user.uid}`, { method: 'PATCH', body: { role: user.role, placeId: user.placeId } })
    savedUid.value = user.uid
    setTimeout(() => (savedUid.value = ''), 2000)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <h1 class="page-title">Admin</h1>
  <p class="mb-4 text-slate-600">Change what each account can do. Hawkers must be linked to the stall they run.</p>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <ul class="space-y-3">
    <li v-for="u in users" :key="u.uid" class="card flex flex-wrap items-end gap-3" data-testid="admin-user">
      <div class="min-w-48 flex-1">
        <p class="font-bold">{{ u.name || 'No name' }}</p>
        <p class="text-sm text-slate-500">{{ u.email }}</p>
      </div>
      <div>
        <label class="label" :for="`role-${u.uid}`">Role</label>
        <select :id="`role-${u.uid}`" v-model="u.role" class="input">
          <option value="diner">Diner</option>
          <option value="hawker">Hawker</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div v-if="u.role === 'hawker'">
        <label class="label" :for="`stall-${u.uid}`">Stall</label>
        <select :id="`stall-${u.uid}`" v-model="u.placeId" class="input">
          <option :value="null" disabled>Choose a stall</option>
          <option v-for="p in places" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <button class="btn-primary" @click="save(u)">{{ savedUid === u.uid ? 'Saved' : 'Save' }}</button>
    </li>
  </ul>
</template>
