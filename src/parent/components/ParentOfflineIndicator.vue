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
import { listOps, OP_STATUS, updateOp } from '@/utils/offlineQueue'
import { flushAllParent, PARENT_KINDS } from '@/parent/utils/parentOfflineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'

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
  let pending = 0
  let needs = 0
  const reviewList: Record<string, unknown>[] = []
  for (const kind of PARENT_KINDS) {
    const p = await listOps({ kind, status: OP_STATUS.PENDING, userId: uid })
    const r = await listOps({ kind, status: OP_STATUS.NEEDS_REVIEW, userId: uid })
    pending += p.length
    needs += r.length
    reviewList.push(...(r as Record<string, unknown>[]))
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
    return `<div style="margin:8px 0;padding:8px;border-left:3px solid #f56c6c;">
      <strong>${op.kind as string}</strong><br>
      建立：${created}<br>
      錯誤：${lastErr ?? '—'}
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

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  refresh()
  timer = setInterval(refresh, 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
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
  background: #0d9053;
  color: #fff;
}
.indicator-btn.review {
  background: #f56c6c;
  color: #fff;
}
</style>
