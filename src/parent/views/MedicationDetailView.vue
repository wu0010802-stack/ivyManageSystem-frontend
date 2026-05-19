<script setup lang="ts">
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

interface MedPhoto {
  id: number
  thumb_url?: string
  url?: string
  original_filename?: string
}

interface MedLog {
  id: number
  scheduled_time?: string
  status: string
  administered_at?: string
  skipped_reason?: string
}

interface MedOrder {
  id: number
  medication_name?: string
  order_date?: string
  dose?: string
  note?: string
  logs?: MedLog[]
  photos: MedPhoto[]
}

const route = useRoute()
const order = ref<MedOrder | null>(null)
const loading = ref(false)
const uploading = ref(false)
const removeTarget = ref<MedPhoto | null>(null)

const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (v: boolean) => {
    if (!v) removeTarget.value = null
  },
})

const STATUS_LABEL: Record<string, string> = {
  pending: '待餵',
  administered: '已餵',
  skipped: '已跳過',
  correction: '已修正',
}

async function fetchOrder() {
  loading.value = true
  try {
    const { data } = await getMedicationOrder(Number(route.params.id))
    order.value = data as MedOrder
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function onPhotoPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !order.value) return
  uploading.value = true
  try {
    await uploadMedicationPhoto(order.value.id, file)
    toast.success('已上傳')
    await fetchOrder()
  } catch (err) {
    const er = err as Record<string, unknown>
    toast.error(String(er?.displayMessage || '上傳失敗'))
  } finally {
    uploading.value = false
  }
}

function askRemovePhoto(att: MedPhoto) {
  removeTarget.value = att
}

async function doRemovePhoto() {
  const att = removeTarget.value
  removeTarget.value = null
  if (!att || !order.value) return
  try {
    await deleteMedicationPhoto(order.value.id, att.id)
    toast.success('已刪除')
    await fetchOrder()
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '刪除失敗'))
  }
}

onMounted(fetchOrder)
</script>

<template>
  <div class="med-detail">
    <template v-if="loading">
      <SkeletonBlock variant="card" :count="2" />
    </template>
    <template v-else-if="order">
      <header class="pt-page-hero">
        <p class="pt-page-hero-eyebrow">用藥單</p>
        <h1 class="pt-page-hero-title">{{ order.medication_name }}</h1>
        <p class="pt-page-hero-note">{{ order.order_date }} · 劑量 {{ order.dose }}</p>
      </header>

      <section v-if="order.note" class="pt-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded">sticky_note_2</span>
          備註
        </h2>
        <p class="note">{{ order.note }}</p>
      </section>

      <section class="pt-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded">schedule</span>
          餵藥時段
          <span class="pt-card-title-count">{{ order.logs?.length || 0 }}</span>
        </h2>
        <ul class="pt-list-group">
          <li v-for="lg in order.logs" :key="lg.id" class="pt-list-row">
            <span class="time">{{ lg.scheduled_time }}</span>
            <span
              class="pt-pill"
              :class="{
                'pt-pill-warn': lg.status === 'pending',
                'pt-pill-success': lg.status === 'administered',
                'pt-pill-danger': lg.status === 'skipped',
                'pt-pill-info': lg.status === 'correction',
              }"
            >{{ STATUS_LABEL[lg.status] }}</span>
            <span class="pt-list-row-body sub-meta">
              <span v-if="lg.administered_at">{{ lg.administered_at }}</span>
              <span v-else-if="lg.skipped_reason">{{ lg.skipped_reason }}</span>
            </span>
          </li>
        </ul>
      </section>

      <section class="pt-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded">photo_library</span>
          藥袋／處方照
          <span class="pt-card-title-count">{{ order.photos.length }} / 5</span>
        </h2>
        <div v-if="order.photos.length === 0" class="hint">尚未上傳</div>
        <div v-else class="photos">
          <div v-for="p in order.photos" :key="p.id" class="photo">
            <img :src="p.thumb_url || p.url" :alt="p.original_filename" loading="lazy" decoding="async" />
            <button
              type="button"
              class="del"
              :aria-label="`刪除 ${p.original_filename}`"
              @click="askRemovePhoto(p)"
            >×</button>
          </div>
        </div>
        <label v-if="order.photos.length < 5" class="pt-action-btn upload-btn">
          <input type="file" accept="image/*,application/pdf" @change="onPhotoPick" hidden :disabled="uploading" />
          <span class="material-symbols-rounded">add_photo_alternate</span>
          {{ uploading ? '上傳中…' : '加照片' }}
        </label>
      </section>
    </template>

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
.med-detail { padding-bottom: 24px; }
.med-detail > .pt-page-hero + .pt-card { margin-top: 12px; }
.med-detail > .pt-card + .pt-card { margin-top: 12px; }

.note {
  margin: 0;
  background: var(--pt-surface-note);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--pt-text-strong);
}

.pt-list-row .time { font-weight: 700; min-width: 56px; color: var(--pt-text-strong); }
.pt-list-row .sub-meta { color: var(--pt-text-faint); font-size: 12px; }

.hint { color: var(--pt-text-placeholder); padding: 4px 0; font-size: 13px; }
.photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.photo { position: relative; }
.photo img { width: 80px; height: 80px; object-fit: cover; border-radius: 10px; }
.photo .del {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--color-danger);
  color: var(--neutral-0);
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
/* 視覺保 24x24，pseudo-element 擴大可點區到 44x44（WCAG 2.1）。 */
.photo .del::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min, 44px);
  height: var(--touch-target-min, 44px);
  transform: translate(-50%, -50%);
}
.upload-btn { margin-top: 12px; }
</style>
