<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { acknowledgeEvent, listEvents } from '../api/events'
import { uploadAckSignature } from '../api/medications'
import SignaturePad from '../components/SignaturePad.vue'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import { loadErrorMessage } from '../utils/loadError'
import { enqueueParent, flushParentQueue } from '@/parent/utils/parentOfflineQueue'
import { OP_KINDS } from '@/utils/offlineQueue'
import { isNetworkError } from '@/composables/useOnlineStatus'
import { invalidateHomeSummary } from '../composables/useHomeSummary'
import { eventTypeLabel } from '@/constants/calendarEventTypes'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useLeaveConfirm } from '../composables/useUnsavedGuard'

interface EventItem {
  id: number
  title?: string
  event_type?: string
  event_date?: string
  description?: string
  requires_acknowledgment?: boolean
  need_ack_student_ids?: (number | string)[]
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
/**
 * 只列還沒簽的孩子：已簽過的孩子再送一次只會被後端擋下或重複簽。
 * 舊資料沒有 need_ack_student_ids 時退回全部子女。
 */
const pendingChildren = computed(() => {
  const need = event.value?.need_ack_student_ids
  if (!Array.isArray(need)) return childrenItems.value
  const ids = new Set(need.map(Number))
  return childrenItems.value.filter((c) => ids.has(c.student_id))
})
/** 事件有待簽清單但已經空了＝全部孩子都簽過 */
const allSigned = computed(() => {
  const need = event.value?.need_ack_student_ids
  return Array.isArray(need) && need.length === 0
})
const signatureName = ref('')
const padRef = ref<SignaturePadRef | null>(null)
const submitting = ref(false)
// P1-18：以 loading / notFound 三態取代「event null = 永遠 skeleton」的二態，
// 避免事件已刪除 / route param 對不上時頁面永久卡 skeleton。
const loading = ref(true)
const notFound = ref(false)
// 連線／伺服器失敗 ≠ 找不到事件：失敗給可重試錯誤態，只有清單裡真的沒有才算找不到
const loadError = ref<unknown>(null)

/** 已經簽了名（或打了簽名文字）但還沒送出：離開前要確認，否則要整個重簽 */
function hasUnsentSignature(): boolean {
  const inked = !!(padRef.value && !padRef.value.isEmpty())
  return inked || (signatureRetryFor.value === null && !!signatureName.value.trim())
}
const { dialogOpen: leaveConfirmOpen, confirmLeave, allowLeave } = useLeaveConfirm(hasUnsentSignature)

async function init() {
  loading.value = true
  notFound.value = false
  loadError.value = null
  await childrenStore.load()
  try {
    const { data } = await listEvents()
    const found = ((data as { items?: EventItem[] })?.items || []).find(
      (e) => e.id === Number(route.params.eventId),
    )
    event.value = found || null
    notFound.value = !found
    // 預設：網址指定的孩子（若仍待簽）→ 第一位待簽的孩子
    const queried = Number(route.query.student_id)
    const pendingIds = pendingChildren.value.map((c) => c.student_id)
    studentId.value = pendingIds.includes(queried) ? queried : (pendingIds[0] ?? null)
  } catch (err) {
    event.value = null
    loadError.value = err
  } finally {
    loading.value = false
  }
}

/**
 * 把簽收寫進離線佇列（含成功提示）。入列失敗會往外拋，由 caller 決定錯誤文案。
 * 離線分流與「假線上」網路失敗 fallback 共用這一條。
 * 呼叫前 submit() 已確保 event / studentId 皆有值。
 */
async function queueAck() {
  await enqueueParent({
    kind: OP_KINDS.EVENT_ACK,
    payload: {
      event_id: event.value!.id,
      student_id: studentId.value,
      signature_name: signatureName.value || null,
    },
    // title 給「無法同步」對話框辨認是哪一筆（家長看不到 event_id）
    meta: { event_id: event.value!.id, title: event.value!.title ?? '' },
  })
  toast.success('已暫存，連線後自動送出')
  flushParentQueue(OP_KINDS.EVENT_ACK).catch(() => {})
}

async function submit() {
  if (!studentId.value) {
    toast.warn('請選擇子女')
    return
  }
  if (!event.value) return
  const sid = studentId.value
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
      await queueAck()
      allowLeave()
      router.replace({ path: '/events' })
    } catch (err) {
      const e = err as Record<string, unknown>
      toast.error(String(e?.displayMessage || '暫存失敗'))
    } finally {
      submitting.value = false
    }
    return
  }

  // 線上路徑
  try {
    await acknowledgeEvent(event.value.id, {
      student_id: sid,
      signature_name: signatureName.value || null,
    })
    // 簽收已成立（簽名上傳成敗另計）：首頁待辦與 tab 徽章立即失效
    void invalidateHomeSummary()
  } catch (err) {
    // navigator.onLine 會說謊（弱訊號、行動網路連著但打不到 server）：網路層失敗
    // 一律 fallback 進佇列。手寫簽名無法入列（同離線分流的限制），維持原錯誤提示。
    const hasSignature = !!(padRef.value && !padRef.value.isEmpty())
    if (isNetworkError(err) && !hasSignature) {
      try {
        await queueAck()
        submitting.value = false
        allowLeave()
        router.replace({ path: '/events' })
        return
      } catch { /* 佇列也寫不進去 → 落回下方錯誤提示 */ }
    }
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '簽收失敗'))
    submitting.value = false
    return
  }

  // 簽收已成立；手寫簽名上傳失敗時留在原頁讓家長直接重傳——簽收後事件列表不再
  // 提供這位孩子的簽名入口，也沒有「事件詳情頁」可以事後補上。
  if (!(await uploadSignature(sid))) {
    signatureRetryFor.value = sid
    submitting.value = false
    toast.warn('已完成簽收，但手寫簽名沒有上傳成功，請按「重新上傳簽名」再試一次')
    return
  }
  toast.success('已簽收')
  submitting.value = false
  allowLeave()
  router.replace({ path: '/events' })
}

/** 簽收已成功、只差手寫簽名沒傳上去的孩子；有值時主按鈕改為「重新上傳簽名」。 */
const signatureRetryFor = ref<number | null>(null)

/** 有手寫簽名就上傳；沒有簽名視為成功。 */
async function uploadSignature(sid: number): Promise<boolean> {
  if (!padRef.value || padRef.value.isEmpty() || !event.value) return true
  try {
    const blob = await padRef.value.toBlob()
    if (blob) await uploadAckSignature(event.value.id, sid, blob)
    return true
  } catch {
    return false
  }
}

async function retrySignatureUpload() {
  const sid = signatureRetryFor.value
  if (sid === null || submitting.value) return
  submitting.value = true
  const ok = await uploadSignature(sid)
  submitting.value = false
  if (ok) {
    signatureRetryFor.value = null
    toast.success('手寫簽名已上傳')
    allowLeave()
    router.replace({ path: '/events' })
  } else {
    toast.warn('簽名仍上傳失敗，請確認網路後再試；簽收本身已經完成')
  }
}

/** 家長自己按「回事件列表／先回事件列表」：明確選擇離開，不再追問 */
function backToEvents() {
  allowLeave()
  router.replace({ path: '/events' })
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
        <p class="pt-page-hero-eyebrow">簽收通知</p>
        <h1 class="pt-page-hero-title">{{ event.title }}</h1>
        <p class="pt-page-hero-note">
          {{ event.event_date }}
          <span v-if="event.event_type" class="event-type">· {{ eventTypeLabel(event.event_type) }}</span>
        </p>
      </header>

      <section v-if="event.description" class="pt-card desc-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded" aria-hidden="true">description</span>
          事件說明
        </h2>
        <p class="desc-text">{{ event.description }}</p>
      </section>

      <section v-if="allSigned" class="pt-card done-card" data-testid="ack-all-signed">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded" aria-hidden="true">task_alt</span>
          已全部簽收
        </h2>
        <p class="pt-muted-note">這個事件您的孩子都已經簽收過了，不需要再簽一次。</p>
        <button type="button" class="pt-ghost-btn back-btn" @click="backToEvents">回事件列表</button>
      </section>

      <section v-else class="pt-card form-card">
        <h2 class="pt-card-title">
          <span class="material-symbols-rounded" aria-hidden="true">draw</span>
          簽收資訊
        </h2>

        <p v-if="pendingChildren.length === 1" class="single-child" data-testid="ack-single-child">
          簽收的孩子：<strong>{{ pendingChildren[0].name }}</strong>
        </p>
        <div v-else class="field">
          <label for="ack-student">由哪一位子女簽收</label>
          <select
            id="ack-student"
            v-model.number="studentId"
            :disabled="signatureRetryFor !== null"
          >
            <option v-for="c in pendingChildren" :key="c.student_id" :value="c.student_id">{{ c.name }}</option>
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

      <div v-if="!allSigned" class="actions">
        <template v-if="signatureRetryFor !== null">
          <p class="pt-muted-note retry-note" role="status">
            簽收已經完成，只差手寫簽名沒有上傳成功。
          </p>
          <button
            type="button"
            class="pt-action-btn submit-btn"
            data-testid="retry-signature"
            :disabled="submitting"
            @click="retrySignatureUpload"
          >
            <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
            {{ submitting ? '上傳中…' : '重新上傳簽名' }}
          </button>
          <button type="button" class="pt-ghost-btn back-btn" @click="backToEvents">先回事件列表</button>
        </template>
        <button
          v-else
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
    <MobileErrorRetry
      v-else-if="loadError"
      :error="loadErrorMessage(loadError, '事件載入失敗，請檢查網路後重試')"
      @retry="init"
    />
    <template v-else>
      <div class="empty-state not-found">
        <span class="material-symbols-rounded" aria-hidden="true">event_busy</span>
        <p class="not-found-title">找不到此事件</p>
        <p class="not-found-note">事件可能已被取消或連結已失效，請回到事件列表確認。</p>
      </div>
    </template>
    <!-- 有未送出的修改時離開前確認（返回鍵／LINE 返回／底部導覽） -->
    <ConfirmDialog
      v-model:open="leaveConfirmOpen"
      title="要離開簽收頁嗎？"
      message="手寫簽名還沒送出，離開後需要重新簽名。"
      confirm-label="離開"
      cancel-label="繼續填寫"
      destructive
      @confirm="confirmLeave"
    />
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
  font-size: 16px; /* <16px 會讓 iOS/LIFF 聚焦時整頁放大，見 inputFontSize.spec.ts */
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
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.single-child { margin: 0; }
.retry-note { margin: 0; text-align: center; }
.back-btn {
  align-self: center;
  min-height: var(--touch-target-min, 44px);
}
.done-card { display: flex; flex-direction: column; gap: var(--space-2, 8px); }
.done-card .pt-muted-note { margin: 0; }
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
