<!-- Makan Kakis: your saved friend groups. Owner: M3 -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { watchMyGroups, createGroup, joinGroup, leaveGroup, deleteGroup } from '../services/groups'
import { getProfile } from '../services/users'

const router = useRouter()
const auth = useAuthStore()
const groups = ref([])
const loading = ref(true)
const newName = ref('')
const joinCode = ref('')
const error = ref('')
let stop = null

// My display name from my Profile (falls back to the login name)
async function myName() {
  const p = await getProfile(auth.user.uid).catch(() => null)
  return p?.name || auth.user.name
}

onMounted(() => {
  stop = watchMyGroups(auth.user.uid,
    list => { groups.value = list; loading.value = false },
    err => { error.value = err.message; loading.value = false })
})
onUnmounted(() => stop && stop()) // stop listening when I leave the page

async function create() {
  error.value = ''
  const name = newName.value.trim()
  if (!name) return (error.value = 'Give your group a name')
  try {
    const code = await createGroup(name, await myName())
    router.push(`/groups/${code}`)
  } catch (err) { error.value = err.message }
}

async function join() {
  error.value = ''
  if (joinCode.value.trim().length !== 6) return (error.value = 'Group codes have 6 letters')
  try {
    const code = await joinGroup(joinCode.value, await myName())
    router.push(`/groups/${code}`)
  } catch (err) { error.value = err.message }
}

// Owner: delete the group for everyone. Member: leave it (you can rejoin with the code).
async function removeFromList(g) {
  error.value = ''
  const isOwner = g.ownerUid === auth.user.uid
  const ok = confirm(isOwner
    ? `Delete "${g.name}" for everyone? This can't be undone.`
    : `Leave "${g.name}"? You can rejoin later with its code ${g.code}.`)
  if (!ok) return
  try { isOwner ? await deleteGroup(g.code) : await leaveGroup(g.code) }
  catch (err) { error.value = err.message }
}

</script>

<template>
  <p class="kicker">Station 1 · Kopitiam Table</p>
  <h1 class="page-title">Makan Kakis</h1>
  <p class="mb-4 text-slate-600">Save your usual makan groups, then start a session for everyone in one tap.</p>
  <p v-if="error" class="error mb-3">{{ error }}</p>

  <div class="grid gap-4 md:grid-cols-3">
    <div class="card md:col-span-2">
      <h2 class="mb-2">Your groups</h2>
      <p v-if="loading" class="text-slate-500">Loading…</p>
      <p v-else-if="!groups.length" class="text-slate-500">No groups yet. Create one, or join a friend's with their code.</p>
        <ul v-else class="flex flex-col gap-3" data-testid="group-list">
        <li v-for="g in groups" :key="g.code">
            <RouterLink :to="`/groups/${g.code}`" class="flex items-center justify-between rounded-2xl border-[3px] border-ink bg-sky px-4 py-3 transition hover:translate-x-1" :class="{ '!bg-accent': g.activeSession }">
            <span>
              <b>{{ g.name }}</b>
              <span class="ml-2 text-sm text-slate-500">{{ g.memberUids.length }} members</span>
            </span>
              <span v-if="g.activeSession" class="chip !bg-coral">● LIVE</span>
          </RouterLink>
          <button class="btn mt-1 text-xs !text-red-700" @click="removeFromList(g)">
            {{ g.ownerUid === auth.user.uid ? 'Delete group' : 'Leave group' }}
          </button>
        </li>
      </ul>
    </div>

    <div class="space-y-4">
        <form class="card card-sun space-y-2" @submit.prevent="create">
        <h2>New group</h2>
        <label class="label" for="group-name">Group name</label>
        <input id="group-name" v-model="newName" class="input" maxlength="40" placeholder="SMU Makan Kakis" data-testid="group-name" />
          <button class="btn-primary w-full !bg-white" type="submit">Create group</button>
      </form>

      <form class="card space-y-2" @submit.prevent="join">
          <h2>Join a group</h2>
        <label class="label" for="group-join">Group code</label>
        <input id="group-join" v-model="joinCode" class="input font-mono uppercase" maxlength="6" placeholder="KQWERT" data-testid="group-join-code" />
        <button class="btn w-full" type="submit">Join group</button>
      </form>
    </div>
  </div>
</template>