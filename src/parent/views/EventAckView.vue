<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { acknowledgeEvent, listEvents } from '../api/events'
import { uploadAckSignature } from '../api/medications'
import SignaturePad from '../components/SignaturePad.vue'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'

interface EventItem {
  id: number
  title?: string
  event_type?: string
  event_date?: string
  description?: string
  [key: string]: unknown
}

interface SignaturePadRef {
  isEmpty(): boolean
  toBlob(): Promise<Blob | null>
}

const route = useRoute()
const router = useRouter()
const childrenStore = useChildrenStore()

const event = ref<EventItem | null>(null)
const studentId = ref<number | null>(null)
const childrenItems = computed(() => (childrenStore.items || []) as { student_id: number; name?: string }[])
const signatureName = ref('')
const padRef = ref<SignaturePadRef | null>(null)
const submitting = ref(false)
// P1-18：以 loading / notFound 三態取代「event null = 永遠 skeleton」的二態，
// 避免事件已刪除 / route param 對不上時頁面永久卡 skeleton。
const loading = ref(true)
const notFound = ref(false)

async function init() {
  loading.value = true
  notFound.value = false
  await childrenStore.load()
  const firstChild = (childrenStore.items as { student_id: number }[])[0]
  studentId.value =
    Number(route.query.student_id) || firstChild?.student_id || null
  try {
    const { data } = await listEvents()
    const found = ((data as { items?: EventItem[] })?.items || []).find(
      (e) => e.id === Number(route.params.eventId),
    )
    event.value = found || null
    notFound.value = !found
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入事件失敗'))
    event.value = null
    notFound.value = true
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!studentId.value) {
    toast.warn('請選擇子女')
    return
  }
  if (!event.value) return
  submitting.value = true

  // 離線分流
  if (!navigator.onLine) {
    const hasSignature = !!(padRef.value && !padRef.value.isEmpty())
    if (hasSignature) {
      toast.warn('手寫簽名上傳需要連線，請稍後再試')
      submitting.value = false
      return
    }
    try {
      await enqueueParent({
        kind: OP_KINDS.EVENT_ACK,
        payload: {
          event_id: event.value.id,
          student_id: studentId.value,
          signature_name: signatureName.value || null,
        },
        meta: { event_id: event.value.id },
      })
      toast.success('已暫存，連線後自動送出')
      flushParentQueue(OP_KINDS.EVENT_ACK).catch(() => {})
      router.replace({ path: '/events' })
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.error(String(e?.displayMessage || '暫存失敗'))
    } finally {
      submitting.value = false
    }
    return
  }

  // 線上路徑（原有邏輯不動）
  let ackOk = false
  try {
    await acknowledgeEvent(event.value.id, {
      student_id: studentId.value,
      signature_name: signatureName.value || null,
    })
    ackOk = true
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '簽收失敗'))
    submitting.value = false
    return
  }

  if (padRef.value && !padRef.value.isEmpty()) {
    try {
      const blob = await padRef.value.toBlob()
      if (blob && event.value) {
        await uploadAckSignature(event.value.id, studentId.value!, blob)
      }
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.warn(String(e?.displayMessage || '已簽收，但簽名上傳失敗，請於事件詳情頁補上'))
      submitting.value = false
      router.replace({ path: '/events' })
      return
    }
  }

  if (ackOk) {
    toast.success('已簽收')
    router.replace({ path: '/events' })
  }
  submitting.value = false
}

onMounted(async () => {
  await init()
  flushParentQueue(OP_KINDS.EVENT_ACK).catch(() => {})
})
</script>

<template>
  <div class="event-ack">
    <template v-if="event">
      <header class="pt-page-hero">
        <p class="pt-page-hero-eyebrow">事件簽收</p>
        <h1 class="pt-page-hero-title">{{ event.title }}</h1>
        <p class="pt-page-hero-note">
          {{ event.event_date }}
          <span v-if="event.event_type" class="event-type">· {{ event.event_type }}</span>
        </p>
      </header>

      <section v-if="event.description" class="pt-card desc-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded" aria-hidden="true">description</span>
          事件說明
        </h2>
        <p class="desc-text">{{ event.description }}</p>
      </section>

      <section class="pt-card form-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded" aria-hidden="true">draw</span>
          簽收資訊
        </h2>

        <div class="field">
          <label for="ack-student">由哪一位子女簽收</label>
          <select id="ack-student" v-model.number="studentId">
            <option v-for="c in childrenItems" :key="c.student_id" :value="c.student_id">{{ c.name }}</option>
          </select>
        </div>

        <div class="field">
          <label for="ack-sig-name">家長簽名（文字，可選）</label>
          <input
            id="ack-sig-name"
            v-model="signatureName"
            placeholder="例：王小明媽媽"
            maxlength="50"
            autocomplete="name"
          />
        </div>

        <div class="field">
          <label>手寫簽名</label>
          <div class="pad-wrap">
            <SignaturePad ref="padRef" :width="320" :height="160" />
          </div>
        </div>
      </section>

      <div class="actions">
        <button
          type="button"
          class="pt-action-btn submit-btn"
          :disabled="submitting"
          @click="submit"
        >
          <span class="material-symbols-rounded" aria-hidden="true">how_to_reg</span>
          {{ submitting ? '送出中…' : '送出簽收' }}
        </button>
      </div>
    </template>
    <template v-else-if="loading">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="2" />
      </div>
    </template>
    <template v-else>
      <div class="empty-state not-found">
        <span class="material-symbols-rounded" aria-hidden="true">event_busy</span>
        <p class="not-found-title">找不到此事件</p>
        <p class="not-found-note">事件可能已被取消或連結已失效，請回到事件列表確認。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.event-ack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 32px;
}
.skeleton-wrap { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.event-type { color: var(--pt-text-faint); }

.desc-card { background: var(--cream, #fffcf2); border-color: var(--sun-300, #ffe285); }
.desc-card .pt-card-title .material-symbols-rounded { color: var(--sun-700, #c99500); }
.desc-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--pt-text-body);
  white-space: pre-wrap;
}

.form-card { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--pt-text-muted);
}
.field input,
.field select {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 12px;
  background: var(--pt-surface-mute-soft, #fefcf3);
  color: var(--pt-text-strong);
  font-family: inherit;
  box-sizing: border-box;
}
.field input:focus,
.field select:focus {
  outline: none;
  border-color: var(--brand-primary, #0d9053);
  background: var(--pt-surface-card, #fff);
}

.pad-wrap {
  display: flex;
  justify-content: center;
  padding: 8px;
  background: var(--cream, #fffcf2);
  border: 1px dashed rgba(13, 144, 83, 0.25);
  border-radius: 12px;
}

.actions {
  padding: 0 16px;
}
.submit-btn {
  width: 100%;
  min-height: 52px;
  font-size: 16px;
}

.empty-state.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  color: var(--pt-text-muted);
}
.empty-state.not-found .material-symbols-rounded {
  font-size: 48px;
  color: var(--pt-text-faint);
  margin-bottom: 4px;
}
.not-found-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.not-found-note {
  margin: 0;
  font-size: 14px;
  max-width: 280px;
  line-height: 1.5;
}
</style>
