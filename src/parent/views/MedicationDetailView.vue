<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  deleteMedicationPhoto,
  getMedicationOrder,
  uploadMedicationPhoto,
} from '../api/medications'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const order = ref(null)
const loading = ref(false)
const uploading = ref(false)

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

async function removePhoto(att) {
  if (!confirm(`確定刪除「${att.original_filename}」？`)) return
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
    <button class="back" @click="router.back()">← 返回</button>
    <p v-if="loading">載入中…</p>
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
          <button class="del" @click="removePhoto(p)">×</button>
        </div>
      </div>
      <label class="upload-btn" v-if="order.photos.length < 5">
        <input type="file" accept="image/*,application/pdf" @change="onPhotoPick" hidden :disabled="uploading" />
        {{ uploading ? '上傳中…' : '+ 加照片' }}
      </label>
    </div>
  </div>
</template>

<style scoped>
.med-detail { padding: 16px; }
.back { background: none; border: none; color: #2c7be5; font-size: 14px; margin-bottom: 8px; }
h2 { margin: 0 0 4px; }
h3 { margin-top: 16px; font-size: 14px; color: #555; }
.meta { color: #888; font-size: 13px; }
.note { background: #f9f9f9; padding: 8px; border-radius: 6px; font-size: 13px; }
.logs { list-style: none; padding: 0; }
.logs li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 14px; }
.time { font-weight: bold; min-width: 50px; }
.status { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.status.pending { background: #fff4e6; color: #a25e0a; }
.status.administered { background: #e6f4ea; color: #2d6a3a; }
.status.skipped { background: #f0f2f5; color: #888; }
.status.correction { background: #ede4ff; color: #5a3da5; }
.ts, .reason { color: #888; font-size: 12px; }
.hint { color: #888; padding: 12px 0; }
.photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.photo { position: relative; }
.photo img { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; }
.photo .del { position: absolute; top: -6px; right: -6px; background: #a51c1c; color: #fff; border: none; width: 22px; height: 22px; border-radius: 11px; }
.upload-btn { display: inline-block; padding: 8px 16px; background: #2c7be5; color: #fff; border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 14px; }
</style>
