<!-- Admin: approve hawker applications, see every account and change roles. Owner: M6 -->
<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'
import { listPlaces } from '../services/places'
import { getApplications, approveApplication, rejectApplication } from '../services/hawkers'

const users = ref([])
const places = ref([])
const applications = ref([])   // hawker applications waiting for a decision
const reasons = ref({})        // uid -> reason typed for a rejection
const error = ref('')
const savedUid = ref('') // shows "Saved" next to the row that was just saved

async function loadAll() {
  try {
    applications.value = await getApplications()
    users.value = await api('/admin/users')
    places.value = await listPlaces()
  } catch (err) {
    error.value = err.message
  }
}
onMounted(loadAll)

// Approve: the server creates the stall and makes the applicant its hawker
async function approve(application) {
  error.value = ''
  try {
    await approveApplication(application.uid)
    await loadAll()
  } catch (err) {
    error.value = err.message
  }
}

async function reject(application) {
  error.value = ''
  try {
    await rejectApplication(application.uid, reasons.value[application.uid] || '')
    await loadAll()
  } catch (err) {
    error.value = err.message
  }
}

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
  <p class="kicker">Harbour master</p>
  <h1 class="page-title">Admin</h1>
  <p v-if="error" class="error mb-4">{{ error }}</p>

  <!-- Hawker applications -->
  <h2 class="mb-2 font-bold">Hawker applications ({{ applications.length }})</h2>
  <p v-if="applications.length === 0" class="card mb-6 text-slate-500">No applications waiting.</p>
  <ul class="mb-6 space-y-3">
    <li v-for="a in applications" :key="a.uid" class="card space-y-2" data-testid="application">
      <p class="font-bold">{{ a.stallName }} <span class="font-normal text-slate-500">by {{ a.applicantName }}</span></p>
      <p class="text-sm text-slate-600">{{ a.cuisine }} · {{ a.address }} · {{ a.dietary.join(', ') || 'no diet tags' }} · {{ a.serviceModes.join(', ') }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn-primary text-sm" @click="approve(a)">Approve</button>
        <input v-model="reasons[a.uid]" placeholder="Reason (if rejecting)" class="input w-56 text-sm" aria-label="Reason" />
        <button class="btn text-sm text-red-700" @click="reject(a)">Reject</button>
      </div>
    </li>
  </ul>

  <h2 class="mb-2 font-bold">Accounts</h2>
  <p class="mb-3 text-sm text-slate-600">Change what each account can do. Hawkers must be linked to the stall they run.</p>

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
