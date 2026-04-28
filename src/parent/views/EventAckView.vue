<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { acknowledgeEvent, listEvents } from '../api/events'
import { uploadAckSignature } from '../api/medications'
import SignaturePad from '../components/SignaturePad.vue'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const childrenStore = useChildrenStore()

const event = ref(null)
const studentId = ref(null)
const signatureName = ref('')
const padRef = ref(null)
const submitting = ref(false)

async function init() {
  await childrenStore.load()
  // 從 route query 接 student_id 與 event detail（簡化：fetch 全部 events 找一筆）
  studentId.value =
    Number(route.query.student_id) || childrenStore.items[0]?.student_id
  try {
    const { data } = await listEvents()
    event.value = (data?.items || []).find(
      (e) => e.id === Number(route.params.eventId),
    )
  } catch (err) {
    toast.error(err?.displayMessage || '載入事件失敗')
  }
}

async function submit() {
  if (!studentId.value) {
    toast.warn('請選擇子女')
    return
  }
  submitting.value = true
  try {
    // Step 1: ack（取 ack_id）
    await acknowledgeEvent(event.value.id, {
      student_id: studentId.value,
      signature_name: signatureName.value || null,
    })

    // Step 2: 若有簽名就上傳
    if (padRef.value && !padRef.value.isEmpty()) {
      const blob = await padRef.value.toBlob()
      if (blob) {
        await uploadAckSignature(event.value.id, studentId.value, blob)
      }
    }
    toast.success('已簽收')
    router.replace({ path: '/events' })
  } catch (err) {
    toast.error(err?.displayMessage || '簽收失敗')
  } finally {
    submitting.value = false
  }
}

onMounted(init)
</script>

<template>
  <div class="event-ack">
    <button class="back" @click="router.back()">← 返回</button>
    <div v-if="event">
      <h2>{{ event.title }}</h2>
      <p class="meta">{{ event.event_date }} · {{ event.event_type }}</p>
      <p v-if="event.description" class="desc">{{ event.description }}</p>

      <label>由哪一位子女簽收</label>
      <select v-model.number="studentId">
        <option v-for="c in childrenStore.items || []" :key="c.student_id" :value="c.student_id">{{ c.name }}</option>
      </select>

      <label>簽名（文字，可選）</label>
      <input v-model="signatureName" placeholder="家長姓名" maxlength="50" />

      <label>手寫簽名</label>
      <SignaturePad ref="padRef" :width="320" :height="160" />

      <div class="actions">
        <button class="submit" @click="submit" :disabled="submitting">
          {{ submitting ? '送出中…' : '簽收' }}
        </button>
      </div>
    </div>
    <p v-else class="hint">載入中…</p>
  </div>
</template>

<style scoped>
.event-ack { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.back { background: none; border: none; color: #2c7be5; font-size: 14px; margin-bottom: 8px; align-self: flex-start; }
h2 { margin: 0 0 4px; font-size: 18px; }
.meta { color: #888; font-size: 13px; }
.desc { background: #f9f9f9; padding: 8px; border-radius: 6px; font-size: 14px; }
label { font-size: 13px; color: #555; margin-top: 8px; }
input, select { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
.actions { margin-top: 16px; }
.submit { width: 100%; padding: 12px; background: #2c7be5; color: #fff; border: none; border-radius: 6px; font-size: 15px; }
.submit:disabled { opacity: 0.5; }
.hint { color: #888; padding: 24px; text-align: center; }
</style>
