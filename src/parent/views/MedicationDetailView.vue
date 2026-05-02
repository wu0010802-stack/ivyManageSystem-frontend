<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  deleteMedicationPhoto,
  getMedicationOrder,
  uploadMedicationPhoto,
} from '../api/medications'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route = useRoute()
const order = ref(null)
const loading = ref(false)
const uploading = ref(false)
const removeTarget = ref(null) // 待刪除的 attachment 或 null

const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (v) => {
    if (!v) removeTarget.value = null
  },
})

const STATUS_LABEL = {
  pending: '待餵',
  administered: '已餵',
  skipped: '已跳過',
  correction: '已修正',
}

async function fetchOrder() {
  loading.value = true
  try {
    const { data } = await getMedicationOrder(route.params.id)
    order.value = data
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function onPhotoPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    await uploadMedicationPhoto(order.value.id, file)
    toast.success('已上傳')
    await fetchOrder()
  } catch (err) {
    toast.error(err?.displayMessage || '上傳失敗')
  } finally {
    uploading.value = false
  }
}

function askRemovePhoto(att) {
  removeTarget.value = att
}

async function doRemovePhoto() {
  const att = removeTarget.value
  removeTarget.value = null
  if (!att) return
  try {
    await deleteMedicationPhoto(order.value.id, att.id)
    toast.success('已刪除')
    await fetchOrder()
  } catch (err) {
    toast.error(err?.displayMessage || '刪除失敗')
  }
}

onMounted(fetchOrder)
</script>

<template>
  <div class="med-detail">
    <template v-if="loading">
      <SkeletonBlock variant="card" :count="2" />
    </template>
    <div v-else-if="order">
      <h2>{{ order.medication_name }}</h2>
      <p class="meta">{{ order.order_date }} · 劑量 {{ order.dose }}</p>
      <p v-if="order.note" class="note">備註：{{ order.note }}</p>

      <h3>餵藥時段</h3>
      <ul class="logs">
        <li v-for="lg in order.logs" :key="lg.id">
          <span class="time">{{ lg.scheduled_time }}</span>
          <span class="status" :class="lg.status">{{ STATUS_LABEL[lg.status] }}</span>
          <span v-if="lg.administered_at" class="ts">{{ lg.administered_at }}</span>
          <span v-else-if="lg.skipped_reason" class="reason">{{ lg.skipped_reason }}</span>
        </li>
      </ul>

      <h3>藥袋／處方照</h3>
      <div v-if="order.photos.length === 0" class="hint">尚未上傳</div>
      <div v-else class="photos">
        <div v-for="p in order.photos" :key="p.id" class="photo">
          <img :src="p.thumb_url || p.url" :alt="p.original_filename" />
          <button
            type="button"
            class="del touch-target"
            :aria-label="`刪除 ${p.original_filename}`"
            @click="askRemovePhoto(p)"
          >
            ×
          </button>
        </div>
      </div>
      <label class="upload-btn" v-if="order.photos.length < 5">
        <input type="file" accept="image/*,application/pdf" @change="onPhotoPick" hidden :disabled="uploading" />
        {{ uploading ? '上傳中…' : '+ 加照片' }}
      </label>
    </div>

    <ConfirmDialog
      v-model:open="removeOpen"
      :title="removeTarget ? `確定刪除「${removeTarget.original_filename}」？` : ''"
      message="刪除後無法還原。"
      confirm-label="刪除"
      destructive
      @confirm="doRemovePhoto"
    />
  </div>
</template>

<style scoped>
.med-detail { padding: 16px; }
h2 { margin: 0 0 4px; }
h3 { margin-top: 16px; font-size: 14px; color: var(--pt-text-muted); }
.meta { color: var(--pt-text-placeholder); font-size: 13px; }
.note { background: var(--pt-surface-note); padding: 8px; border-radius: 6px; font-size: 13px; }
.logs { list-style: none; padding: 0; }
.logs li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--pt-border-light); font-size: 14px; }
.time { font-weight: bold; min-width: 50px; }
.status { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.status.pending { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }
.status.administered { background: var(--brand-primary-soft); color: var(--pt-success-text); }
.status.skipped { background: var(--pt-surface-mute); color: var(--pt-text-placeholder); }
.status.correction { background: #ede4ff; color: #5a3da5; }
.ts, .reason { color: var(--pt-text-placeholder); font-size: 12px; }
.hint { color: var(--pt-text-placeholder); padding: 12px 0; }
.photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.photo { position: relative; }
.photo img { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; }
.photo .del {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--color-danger);
  color: var(--neutral-0);
  border: none;
  min-width: 24px;
  min-height: 24px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.upload-btn { display: inline-block; padding: 8px 16px; background: var(--pt-info-link); color: var(--neutral-0); border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 14px; }
</style>
