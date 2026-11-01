<!-- Community menu for a Hidden Gem: photos and dishes added by users. Owner: M5
     Usage: <GemMenu :gem-id="id" :gem-owner-uid="uid" editable />
     Leave out "editable" for a view-only menu (the preorder page). -->

     
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  getMenu, addMenuItem, updateMenuItem, deleteMenuItem,
  addMenuPhoto, deleteMenuPhoto, photoToDataUrl
} from '../services/gems'

const props = defineProps({
  gemId: { type: String, required: true },
  gemOwnerUid: { type: String, default: '' },
  editable: { type: Boolean, default: false }
})

const auth = useAuthStore()
const items = ref([])
const photos = ref([])
const loaded = ref(false)
const error = ref('')
const item = ref({ name: '', price: '' })
const editingId = ref(null)
const photoKey = ref(0)
const expandedId = ref(null)

const canContribute = computed(() => props.editable && auth.isLoggedIn)
const mine = x => !!auth.user && x.addedBy === auth.user.uid
const canRemove = x => mine(x) || (!!auth.user && auth.user.uid === props.gemOwnerUid)

async function load() {
  error.value = ''
  try {
    const data = await getMenu(props.gemId)
    items.value = data.items
    photos.value = data.photos
  } catch (err) {
    error.value = err.message
  }
  loaded.value = true
}
onMounted(load)
watch(() => props.gemId, load)

async function run(action) {
  error.value = ''
  try { await action(); await load() } catch (err) { error.value = err.message }
}
function cancelEdit() {
  editingId.value = null
  item.value = { name: '', price: '' }
}
function startEdit(x) {
  editingId.value = x.id
  item.value = { name: x.name, price: x.price }
}
const saveItem = () => run(async () => {
  if (editingId.value) await updateMenuItem(props.gemId, editingId.value, item.value)
  else await addMenuItem(props.gemId, item.value)
  cancelEdit()
})
const removeItem = x => run(() => deleteMenuItem(props.gemId, x.id))
async function onPhoto(e) {
  const file = e.target.files?.[0]
  if (!file) return
  await run(async () => { await addMenuPhoto(props.gemId, await photoToDataUrl(file)) })
  photoKey.value++
}
const removePhoto = p => run(() => deleteMenuPhoto(props.gemId, p.id))
</script>

<template>
  <div class="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="gem-menu">
    <p class="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
      Community menu: added by users, not by the stall or ChopeLess. Dishes and prices are subject to accuracy.
    </p>

    <div v-if="photos.length" class="grid grid-cols-2 gap-2">
      <div v-for="p in photos" :key="p.id" class="space-y-1" :class="expandedId === p.id ? 'col-span-2' : ''">
        <img :src="p.imageUrl" alt="Menu photo added by a user" class="w-full cursor-pointer rounded-lg"
             :class="expandedId === p.id ? '' : 'h-32 object-cover'"
             @click="expandedId = expandedId === p.id ? null : p.id" />
        <p class="text-xs text-slate-500">
          Added by {{ p.addedByName }}
          <button v-if="canContribute && canRemove(p)" type="button" class="ml-2 text-red-600" @click="removePhoto(p)">Delete</button>
        </p>
      </div>
    </div>

    <ul v-if="items.length" class="divide-y divide-slate-100 text-sm">
      <li v-for="x in items" :key="x.id" class="flex items-center justify-between gap-2 py-1">
        <span>{{ x.name }} <span class="text-xs text-slate-400">added by {{ x.addedByName }}</span></span>
        <span class="flex items-center gap-2">
          <span class="font-semibold">${{ Number(x.price).toFixed(2) }}</span>
          <button v-if="canContribute && mine(x)" type="button" class="text-xs font-semibold text-brand" @click="startEdit(x)">Edit</button>
          <button v-if="canContribute && canRemove(x)" type="button" class="text-xs text-red-600" @click="removeItem(x)">Delete</button>
        </span>
      </li>
    </ul>
    <p v-else-if="loaded && !photos.length && !error" class="text-sm text-slate-500">No menu yet.</p>

    <template v-if="canContribute">
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="saveItem">
        <div class="min-w-0 flex-1">
          <label class="label" :for="'mi-name-' + gemId">Dish</label>
          <input :id="'mi-name-' + gemId" v-model="item.name" required maxlength="60" class="input" />
        </div>
        <div class="w-24">
          <label class="label" :for="'mi-price-' + gemId">Price ($)</label>
          <input :id="'mi-price-' + gemId" v-model="item.price" type="number" min="0" step="0.1" required class="input" />
        </div>
        <button class="btn-primary text-sm" type="submit">{{ editingId ? 'Update' : 'Add dish' }}</button>
        <button v-if="editingId" type="button" class="btn text-sm" @click="cancelEdit">Cancel</button>
      </form>
      <div>
        <label class="label" :for="'mi-photo-' + gemId">Add a photo of the menu</label>
        <input :id="'mi-photo-' + gemId" :key="photoKey" type="file" accept="image/*" class="input" @change="onPhoto" />
      </div>
    </template>
    <p v-else-if="editable" class="text-sm text-slate-500">Log in to add dishes or a menu photo.</p>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>