<script setup lang="ts">
/**
 * 家長端離線同步狀態 indicator。
 *
 * 三狀態：
 * - 0 pending + 0 needs_review → 隱藏
 * - N pending → 顯示「N 筆等待同步」+ 點按手動 flush
 * - K needs_review → 顯示「K 筆無法同步」+ 點開 ElMessageBox 列詳情
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listOpsForKinds, onOpsEnqueued, OP_STATUS, updateOp } from '@/utils/offlineQueue'
import { flushAllParent, PARENT_KINDS } from '@/parent/utils/parentOfflineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { escapeHtml } from '@/utils/html'

const authStore = useParentAuthStore()

const pendingCount = ref(0)
const reviewCount = ref(0)
const reviewOps = ref<Record<string, unknown>[]>([])

async function refresh() {
  const user = authStore.user as { user_id?: number | string } | null
  const uid = user?.user_id
  if (!uid) {
    pendingCount.value = 0
    reviewCount.value = 0
    return
  }
  // 5 kind 一次 getAll()（listOpsForKinds），取代逐 kind×status 呼叫 listOps 的
  // 10 次全表掃描。
  const grouped = await listOpsForKinds({ kinds: PARENT_KINDS, userId: uid })
  let pending = 0
  let needs = 0
  const reviewList: Record<string, unknown>[] = []
  for (const kind of PARENT_KINDS) {
    const g = grouped[kind]
    pending += g.pending.length
    needs += g.needs_review.length
    reviewList.push(...g.needs_review)
  }
  pendingCount.value = pending
  reviewCount.value = needs
  reviewOps.value = reviewList
}

async function manualFlush() {
  await flushAllParent()
  await refresh()
}

async function openReviewDialog() {
  const html = reviewOps.value.map((op) => {
    const created = op.created_at as string
    const lastErr = op.last_error as string | null
    // last_error / kind / created 皆可能含後端回傳的使用者可控字串，
    // dangerouslyUseHTMLString 場景必須逐欄 escape，否則形成 XSS（C47）。
    return `<div style="margin:8px 0;padding:8px;border-left:3px solid #f56c6c;">
      <strong>${escapeHtml(op.kind)}</strong><br>
      建立：${escapeHtml(created)}<br>
      錯誤：${escapeHtml(lastErr ?? '—')}
    </div>`
  }).join('')
  try {
    // EP 動態 import：parent 唯一用 element-plus 的點，延遲載入讓 parent 首屏
    // 完全不載 element-plus（160KB gz）。確認操作是罕見互動，延遲無感。
    const { ElMessageBox } = await import('element-plus')
    await ElMessageBox.confirm(html, '無法同步的操作', {
      confirmButtonText: '全部重試',
      cancelButtonText: '聯絡管理員',
      dangerouslyUseHTMLString: true,
    })
    for (const op of reviewOps.value) {
      await updateOp(op.id as string, {
        status: OP_STATUS.PENDING,
        attempts: 0,
        last_error: null,
      })
    }
    await manualFlush()
  } catch {
    // 取消 = 聯絡管理員：v1 簡單導向 messages
    window.location.href = '/parent.html#/messages'
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
})
onUnmounted(() => {
  disposed = true
  if (timer) clearTimeout(timer)
  unsubscribeEnqueued?.()
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
      <span class="material-symbols-rounded">sync</span>
      {{ pendingCount }} 筆等待同步
    </button>
    <button
      v-if="reviewCount > 0"
      data-testid="open-review"
      class="indicator-btn review"
      @click="openReviewDialog"
    >
      <span class="material-symbols-rounded">error</span>
      {{ reviewCount }} 筆無法同步
    </button>
  </div>
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
</style>
