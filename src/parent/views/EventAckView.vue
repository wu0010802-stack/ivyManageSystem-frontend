<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { acknowledgeEvent, listEvents } from '../api/events'
import { uploadAckSignature } from '../api/medications'
import SignaturePad from '../components/SignaturePad.vue'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'

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
    <div v-if="event">
      <h2>{{ event.title }}</h2>
      <p class="meta">{{ event.event_date }} · {{ event.event_type }}</p>
      <p v-if="event.description" class="desc">{{ event.description }}</p>

      <label for="ack-student">由哪一位子女簽收</label>
      <select id="ack-student" v-model.number="studentId">
        <option v-for="c in childrenStore.items || []" :key="c.student_id" :value="c.student_id">{{ c.name }}</option>
      </select>

      <label for="ack-sig-name">簽名（文字，可選）</label>
      <input
        id="ack-sig-name"
        v-model="signatureName"
        placeholder="家長姓名"
        maxlength="50"
        autocomplete="name"
      />

      <label>手寫簽名</label>
      <SignaturePad ref="padRef" :width="320" :height="160" />

      <div class="actions">
        <button type="button" class="submit" :disabled="submitting" @click="submit">
          {{ submitting ? '送出中…' : '簽收' }}
        </button>
      </div>
    </div>
    <template v-else>
      <SkeletonBlock variant="card" :count="2" />
    </template>
  </div>
</template>

<style scoped>
.event-ack { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
h2 { margin: 0 0 4px; font-size: 18px; }
.meta { color: var(--pt-text-placeholder); font-size: 13px; }
.desc { background: var(--pt-surface-note); padding: 8px; border-radius: 6px; font-size: 14px; }
label { font-size: 13px; color: var(--pt-text-muted); margin-top: 8px; }
input, select { padding: 8px; border: 1px solid var(--pt-text-hint); border-radius: 6px; font-size: 14px; }
.actions { margin-top: 16px; }
.submit { width: 100%; padding: 12px; background: var(--pt-info-link); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 15px; }
.submit:disabled { opacity: 0.5; }
</style>
