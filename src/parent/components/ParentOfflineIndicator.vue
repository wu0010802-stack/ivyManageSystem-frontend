<script setup lang="ts">
/**
 * 家長端離線同步狀態 indicator。
 *
 * 三狀態：
 * - 0 pending + 0 needs_review → 隱藏
 * - N pending → 顯示「N 筆等待同步」+ 點按手動 flush
 * - K needs_review → 顯示「K 筆無法同步」+ 點開對話框逐筆「重試／捨棄」
 *
 * 對話框用家長端 AppModal（家長端沒載 Element Plus CSS，ElMessageBox 會是無樣式的
 * 裸 DOM）。關閉／ESC／點背景一律只關閉，不再被當成「聯絡管理員」導去聯絡簿。
 * kind 一律顯示中文名稱（PARENT_KIND_LABEL），不露 parent_leave_request 等代碼；
 * 內容走 Vue 文字插值，last_error 即使含 HTML 也不會被解析（C47）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listOpsForKinds, onOpsEnqueued, OP_STATUS, updateOp } from '@/utils/offlineQueue'
import {
  describeParentOp,
  discardParentOp,
  flushAllParent,
  friendlyOpError,
  onParentQueueChange,
  PARENT_KIND_LABEL,
  PARENT_KINDS,
  retryParentOp,
  type ParentOpKind,
} from '@/parent/utils/parentOfflineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { fmtDateTime } from '@/parent/utils/datetime'
import AppModal from './AppModal.vue'
import M3Button from './m3/M3Button.vue'

interface ReviewOp {
  id: string
  kind: ParentOpKind
  created_at?: string
  last_error?: unknown
  [key: string]: unknown
}

const authStore = useParentAuthStore()

const pendingCount = ref(0)
const reviewCount = ref(0)
const reviewOps = ref<ReviewOp[]>([])
const reviewOpen = ref(false)
/** 正在重試／捨棄的 op（同時只處理一筆，避免連點） */
const busyId = ref<string | null>(null)
const retryingAll = ref(false)
/** 按過「捨棄」、等待第二次確認的 op */
const confirmDiscardId = ref<string | null>(null)

async function refresh() {
  const user = authStore.user as { user_id?: number | string } | null
  const uid = user?.user_id
  if (!uid) {
    pendingCount.value = 0
    reviewCount.value = 0
    reviewOps.value = []
    return
  }
  // 5 kind 一次 getAll()（listOpsForKinds），取代逐 kind×status 呼叫 listOps 的
  // 10 次全表掃描。
  const grouped = await listOpsForKinds({ kinds: PARENT_KINDS, userId: uid })
  let pending = 0
  let needs = 0
  const reviewList: ReviewOp[] = []
  for (const kind of PARENT_KINDS) {
    const g = grouped[kind]
    pending += g.pending.length
    needs += g.needs_review.length
    reviewList.push(...(g.needs_review as ReviewOp[]))
  }
  pendingCount.value = pending
  reviewCount.value = needs
  reviewOps.value = reviewList
  // 全部處理完就把對話框收掉，不留一個空清單
  if (needs === 0) reviewOpen.value = false
}

async function manualFlush() {
  await flushAllParent()
  await refresh()
}

function openReviewDialog() {
  confirmDiscardId.value = null
  reviewOpen.value = true
}

function kindLabel(kind: string): string {
  return PARENT_KIND_LABEL[kind as ParentOpKind] ?? '離線操作'
}

async function retryOne(op: ReviewOp) {
  if (busyId.value) return
  busyId.value = op.id
  confirmDiscardId.value = null
  try {
    await retryParentOp(op)
  } catch {
    // 重送失敗會由 flush 寫回 last_error；這裡只負責刷新畫面
  } finally {
    busyId.value = null
    await refresh()
  }
}

async function discardOne(op: ReviewOp) {
  if (busyId.value) return
  busyId.value = op.id
  try {
    await discardParentOp(op.id)
  } finally {
    busyId.value = null
    confirmDiscardId.value = null
    await refresh()
  }
}

async function retryAll() {
  if (retryingAll.value) return
  retryingAll.value = true
  confirmDiscardId.value = null
  try {
    for (const op of reviewOps.value) {
      await updateOp(op.id, {
        status: OP_STATUS.PENDING,
        attempts: 0,
        last_error: null,
      })
    }
    await manualFlush()
  } finally {
    retryingAll.value = false
  }
}

const show = computed(() => pendingCount.value > 0 || reviewCount.value > 0)

// 佇列非空（有 pending/needs_review）時維持原本 5s 輪詢；佇列全空時降頻到 30s，
// 省下多數 session 全程 pendingCount===0 卻仍常駐掃描的成本。降頻期間若有新 op
// 入列，靠 onOpsEnqueued 事件立即補一次 refresh + 恢復 5s 節奏，延遲不會變差。
const POLL_ACTIVE_MS = 5000
const POLL_IDLE_MS = 30000

let timer: ReturnType<typeof setTimeout> | null = null
let unsubscribeEnqueued: (() => void) | null = null
let unsubscribeQueueChange: (() => void) | null = null
// P2：unmount 若撞上 tick()/onOpsEnqueued 回呼中 `await refresh()` 進行中的
// 窗口，onUnmounted 當下能清的只有「已經觸發、value 已消耗」的舊 timer id；
// refresh() 事後才 resolve 時，若沒有這個旗標，程式仍會照常呼叫
// scheduleNext() 建立一個新 timer——這個新 timer 沒有人會再清（onUnmounted
// 已經跑過一次），形成殭屍輪詢。disposed 讓這些「事後才繼續執行」的路徑
// 全部提前短路。
let disposed = false

function scheduleNext(delay: number) {
  if (disposed) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(tick, delay)
}

// 輪詢 tick：背景分頁（document.hidden）時跳過 refresh（省 IO），但仍以 active
// 間隔重排，確保回到前景時能在原本的時間內恢復輪詢。
async function tick() {
  if (disposed) return
  if (typeof document !== 'undefined' && document.hidden) {
    scheduleNext(POLL_ACTIVE_MS)
    return
  }
  await refresh()
  if (disposed) return
  scheduleNext(show.value ? POLL_ACTIVE_MS : POLL_IDLE_MS)
}

onMounted(async () => {
  await refresh()
  if (disposed) return
  scheduleNext(show.value ? POLL_ACTIVE_MS : POLL_IDLE_MS)
  unsubscribeEnqueued = onOpsEnqueued(() => {
    refresh().then(() => {
      if (disposed) return
      scheduleNext(POLL_ACTIVE_MS)
    })
  })
  // 背景補送成功／捨棄後立即更新數字，不必等下一個輪詢 tick
  unsubscribeQueueChange = onParentQueueChange(() => {
    if (!disposed) refresh()
  })
})
onUnmounted(() => {
  disposed = true
  if (timer) clearTimeout(timer)
  unsubscribeEnqueued?.()
  unsubscribeQueueChange?.()
})
</script>

<template>
  <div v-if="show" class="parent-offline-indicator">
    <button
      v-if="pendingCount > 0"
      data-testid="manual-flush"
      class="indicator-btn pending"
      @click="manualFlush"
    >
      <span class="material-symbols-rounded" aria-hidden="true">sync</span>
      {{ pendingCount }} 筆等待同步
    </button>
    <button
      v-if="reviewCount > 0"
      data-testid="open-review"
      class="indicator-btn review"
      @click="openReviewDialog"
    >
      <span class="material-symbols-rounded" aria-hidden="true">error</span>
      {{ reviewCount }} 筆無法同步
    </button>
  </div>

  <AppModal
    v-model:open="reviewOpen"
    labelled-by="offline-review-title"
    described-by="offline-review-desc"
  >
    <div class="review-dialog" data-testid="review-dialog">
      <h2 id="offline-review-title" class="review-title m3-title-large">
        有 {{ reviewCount }} 筆沒有送出
      </h2>
      <p id="offline-review-desc" class="pt-muted-note">
        這些操作多次嘗試仍無法送到園所。可以再試一次，或捨棄後重新填寫。
      </p>
      <ul class="review-list">
        <li v-for="op in reviewOps" :key="op.id" class="review-item" data-testid="review-item">
          <div class="review-item-head">
            <strong class="review-kind">{{ kindLabel(op.kind) }}</strong>
            <span class="pt-muted-note">{{ fmtDateTime(op.created_at) }}</span>
          </div>
          <p v-if="describeParentOp(op)" class="review-detail">{{ describeParentOp(op) }}</p>
          <p class="pt-muted-note" data-testid="review-error">原因：{{ friendlyOpError(op.last_error) }}</p>
          <div v-if="confirmDiscardId === op.id" class="review-actions">
            <span class="review-confirm-text">捨棄後不會送出，確定嗎？</span>
            <M3Button variant="text" class="review-btn" @click="confirmDiscardId = null">保留</M3Button>
            <M3Button
              variant="filled"
              class="review-btn is-destructive"
              data-testid="confirm-discard"
              :disabled="busyId !== null"
              @click="discardOne(op)"
            >捨棄</M3Button>
          </div>
          <div v-else class="review-actions">
            <M3Button
              variant="text"
              class="review-btn"
              data-testid="discard"
              :disabled="busyId !== null || retryingAll"
              @click="confirmDiscardId = op.id"
            >捨棄</M3Button>
            <M3Button
              variant="tonal"
              class="review-btn"
              data-testid="retry-one"
              :disabled="busyId !== null || retryingAll"
              @click="retryOne(op)"
            >{{ busyId === op.id ? '重試中…' : '重試' }}</M3Button>
          </div>
        </li>
      </ul>
      <p class="pt-muted-note">一直無法送出時，請直接聯絡園所老師。</p>
      <div class="review-footer">
        <M3Button variant="text" class="review-btn" data-testid="close-review" @click="reviewOpen = false">
          關閉
        </M3Button>
        <M3Button
          variant="filled"
          class="review-btn"
          data-testid="retry-all"
          :disabled="busyId !== null || retryingAll"
          @click="retryAll"
        >{{ retryingAll ? '重試中…' : '全部重試' }}</M3Button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.parent-offline-indicator {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  gap: 8px;
}
.indicator-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 9999px;
  border: none;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .15);
}
.indicator-btn.pending {
  background: var(--m3-primary, var(--brand-primary, #0d9053));
  color: var(--m3-on-primary, #fff);
}
.indicator-btn.review {
  background: var(--m3-error, var(--color-danger, #f56c6c));
  color: var(--m3-on-error, #fff);
}

.review-dialog {
  padding: var(--space-6, 24px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.review-title { margin: 0; }
.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  max-height: 50vh;
  overflow-y: auto;
}
.review-item {
  padding: var(--space-3, 12px);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-md, 8px);
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}
.review-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2, 8px);
}
.review-detail { margin: 0; }
.review-item .pt-muted-note,
.review-dialog > .pt-muted-note { margin: 0; }
.review-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-top: var(--space-1, 4px);
}
.review-confirm-text { flex: 1 1 100%; text-align: right; }
.review-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
}
/* 家長單手操作：對話框內每顆按鈕至少 44px 高 */
.review-btn { min-height: var(--touch-target-min, 44px); }
.review-btn.is-destructive {
  background: var(--color-danger);
  color: var(--color-primary-contrast);
}
</style>
