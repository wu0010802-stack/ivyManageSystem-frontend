<template>
  <section class="fee-workbench" aria-label="學費管理工作台">
    <p class="context-line">
      今天 {{ today }}<span aria-hidden="true"> ・ </span>統計月份 {{ monthLabel }}
    </p>

    <el-skeleton v-if="loading" :rows="5" animated data-test="workbench-skeleton" />

    <ul v-else class="queue" data-test="workbench-queue">
      <li v-for="item in queueItems" :key="item.key" class="queue-row">
        <span class="row-status" :data-state="item.state">
          <el-icon class="row-status__icon" aria-hidden="true">
            <CircleCheck v-if="item.state === 'ok'" />
            <Warning v-else-if="item.state === 'action'" />
            <MoreFilled v-else />
          </el-icon>
          <span class="sr-only">{{ STATE_TEXT[item.state] }}</span>
        </span>
        <div class="row-main">
          <span class="row-title">{{ item.title }}</span>
          <span class="row-detail">{{ item.detail }}</span>
        </div>
        <el-button
          class="row-action"
          size="small"
          :type="item.state === 'action' ? 'primary' : 'default'"
          :plain="item.state === 'action'"
          :text="item.state !== 'action'"
          :aria-label="`${item.title}：${item.actionLabel}`"
          :data-test="`workbench-action-${item.key}`"
          @click="emit('navigate', item.target)"
        >
          {{ item.actionLabel }}
        </el-button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * 學費管理工作台：以工作佇列呈現「現在需要處理什麼」。
 *
 * 資料來源全部是既有唯讀 API（一次載入、失敗逐項降級）：
 * - GET /fees/close-periods/summary：本月銀行待分類/未分配、待處理退款數、關帳 checklist
 * - GET /fees/cash-handovers：今日現金交接狀態
 * - GET /fees/periods + /fees/summary：本學期費用單收款狀態
 * - GET /fees/close-periods：本月是否已關帳
 *
 * 原則：拿不到可靠數字的項目只顯示狀態與入口，絕不顯示推估/假數字。
 * 佇列不含任何學生姓名等 PII，只有聚合計數與金額。
 */
import { computed, onActivated, onMounted, ref } from 'vue'
import { CircleCheck, MoreFilled, Warning } from '@element-plus/icons-vue'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { getCurrentAcademicTerm } from '@/utils/academic'
import {
  getCashHandovers,
  getClosePeriods,
  getCloseSummary,
  getFeePeriods,
  getFeeSummary,
} from '@/api/fees'
import type { FeeWorkspaceKey } from './feesNavigation'

type RowState = 'ok' | 'action' | 'muted' | 'unknown'

interface QueueItem {
  key: string
  title: string
  detail: string
  state: RowState
  actionLabel: string
  target: { ws: FeeWorkspaceKey; view?: string }
}

interface CloseSummaryLite {
  bank: { unallocated: number; unclassified_count: number }
  owner: { pending_refunds: number }
  checklist: Record<string, boolean>
}
interface HandoverLite {
  business_date: string
  status: string
  cash_receipt_total: number
  variance: number | null
}
interface FeeSummaryLite {
  total_count: number
  unpaid_count: number
  partial_count: number
  total_unpaid: number
}
interface ClosePeriodLite {
  close_year: number
  close_month: number
  status: string
}

const emit = defineEmits<{
  navigate: [target: { ws: FeeWorkspaceKey; view?: string }]
}>()

const STATE_TEXT: Record<RowState, string> = {
  ok: '已完成',
  action: '待處理',
  muted: '無待辦',
  unknown: '狀態未知',
}

const today = todayISO()
const monthLabel = today.slice(0, 7)

const loading = ref(true)
const closeSummary = ref<CloseSummaryLite | null>(null)
const todayHandover = ref<HandoverLite | null>(null)
const handoversLoaded = ref(false)
const currentPeriod = ref<string | null>(null)
const feeSummary = ref<FeeSummaryLite | null>(null)
const feeSummaryLoaded = ref(false)
const monthClosed = ref<boolean | null>(null)

async function loadCloseSummary() {
  const [y, m] = monthLabel.split('-').map(Number)
  try {
    closeSummary.value = (await getCloseSummary(y, m)) as unknown as CloseSummaryLite
  } catch {
    closeSummary.value = null // 降級：不顯示數字，只留入口
  }
}

async function loadTodayHandover() {
  try {
    const data = await getCashHandovers()
    const items = (data.items ?? []) as HandoverLite[]
    todayHandover.value = items.find((b) => b.business_date === today) ?? null
    handoversLoaded.value = true
  } catch {
    handoversLoaded.value = false
  }
}

async function loadFeeSummary() {
  try {
    const periods = ((await getFeePeriods()) as string[]) ?? []
    const term = getCurrentAcademicTerm()
    const termPeriod = `${term.school_year}-${term.semester}`
    currentPeriod.value = periods.includes(termPeriod) ? termPeriod : periods[0] ?? null
    if (!currentPeriod.value) {
      feeSummaryLoaded.value = true // 查得到 periods、但一筆都沒有＝尚未產單
      return
    }
    feeSummary.value = (await getFeeSummary({
      period: currentPeriod.value,
    })) as FeeSummaryLite
    feeSummaryLoaded.value = true
  } catch {
    feeSummaryLoaded.value = false
  }
}

async function loadMonthClosed() {
  const [y, m] = monthLabel.split('-').map(Number)
  try {
    const data = await getClosePeriods()
    const items = (data.items ?? []) as ClosePeriodLite[]
    monthClosed.value = items.some(
      (row) => row.close_year === y && row.close_month === m && row.status === 'closed',
    )
  } catch {
    monthClosed.value = null
  }
}

async function loadAll(initial: boolean) {
  if (initial) loading.value = true
  await Promise.allSettled([
    loadCloseSummary(),
    loadTodayHandover(),
    loadFeeSummary(),
    loadMonthClosed(),
  ])
  loading.value = false
}

// KeepAlive 下切回工作台時重新整理待辦（不閃 skeleton）；
// 首次 activated 與 mounted 連發，用旗標避免重複載入。
let mountedOnce = false
onMounted(async () => {
  await loadAll(true)
  mountedOnce = true
})
onActivated(() => {
  if (mountedOnce) loadAll(false)
})

function bankItem(): QueueItem {
  const base = {
    key: 'recon',
    title: '銀行交易',
    actionLabel: '前往對帳',
    target: { ws: 'recon' as const },
  }
  const s = closeSummary.value
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入本月統計，點入對帳工作區查看' }
  }
  const pending = s.bank.unclassified_count
  if (pending > 0) {
    return {
      ...base,
      state: 'action',
      detail: `本月 ${pending} 筆交易待媒合或分類，未分配 ${formatCurrency(s.bank.unallocated)}`,
    }
  }
  return { ...base, state: 'ok', detail: '本月銀行交易已全數分類', actionLabel: '查看' }
}

function handoverItem(): QueueItem {
  const base = {
    key: 'handover',
    title: '今日現金交接',
    actionLabel: '前往交接',
    target: { ws: 'settlement' as const, view: 'handover' },
  }
  if (!handoversLoaded.value) {
    return { ...base, state: 'unknown', detail: '無法載入交接狀態，點入每日交接查看' }
  }
  const batch = todayHandover.value
  if (!batch) {
    return {
      ...base,
      state: 'muted',
      detail: '今日尚無現金收款；收到現金時請先登記收款',
      actionLabel: '登記收款',
    }
  }
  if (batch.status === 'draft' || batch.status === 'reopened') {
    return {
      ...base,
      state: 'action',
      detail: `今日已收現金 ${formatCurrency(batch.cash_receipt_total)}，尚未提交交接`,
    }
  }
  if (batch.status === 'submitted') {
    return { ...base, state: 'action', detail: '交接已提交，待老闆簽收' }
  }
  const varianceNote =
    batch.variance != null && batch.variance !== 0
      ? `，簽收差異 ${formatCurrency(batch.variance)}`
      : ''
  return { ...base, state: 'ok', detail: `今日交接已完成${varianceNote}`, actionLabel: '查看' }
}

function refundItem(): QueueItem {
  const base = {
    key: 'refunds',
    title: '預繳退款',
    actionLabel: '前往處理',
    target: { ws: 'billing' as const, view: 'prepayments' },
  }
  const s = closeSummary.value
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入退款狀態，點入預繳查看' }
  }
  const pending = s.owner.pending_refunds
  if (pending > 0) {
    return { ...base, state: 'action', detail: `${pending} 筆預繳退款待核准或交付現金` }
  }
  return { ...base, state: 'ok', detail: '目前沒有待處理的預繳退款', actionLabel: '查看' }
}

function closeItem(): QueueItem {
  const base = {
    key: 'close',
    title: '本月關帳',
    actionLabel: '前往月結',
    target: { ws: 'settlement' as const, view: 'close' },
  }
  if (monthClosed.value === true) {
    return { ...base, state: 'ok', detail: '本月已關帳（快照已凍結）', actionLabel: '查看' }
  }
  const s = closeSummary.value
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入關帳檢查，點入月結查看' }
  }
  const failing = Object.values(s.checklist).filter((ok) => !ok).length
  if (failing > 0) {
    return { ...base, state: 'action', detail: `${failing} 項關帳前檢查未通過，暫不具直接關帳條件` }
  }
  return { ...base, state: 'action', detail: '關帳前檢查全數通過，可進行本月關帳' }
}

function billingItem(): QueueItem {
  const base = {
    key: 'billing',
    title: '本學期費用單',
    actionLabel: '前往帳單',
    target: { ws: 'billing' as const, view: 'records' },
  }
  if (!feeSummaryLoaded.value) {
    return { ...base, state: 'unknown', detail: '無法載入收款統計，點入帳單查看' }
  }
  if (!currentPeriod.value) {
    // 產單已改每日排程自動化：空狀態導向費用設定確認範本，而非手動產單
    return {
      ...base,
      state: 'muted',
      detail: '尚未產生任何費用單；啟用費用範本後，系統將於每日自動產生本學期帳款',
      actionLabel: '前往費用設定',
      target: { ws: 'settings' as const, view: 'templates' },
    }
  }
  const s = feeSummary.value
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入收款統計，點入帳單查看' }
  }
  const outstanding = s.unpaid_count + s.partial_count
  if (outstanding > 0) {
    return {
      ...base,
      state: 'action',
      detail: `${currentPeriod.value} 學期 ${outstanding} 筆未收齊，未收 ${formatCurrency(s.total_unpaid)}`,
    }
  }
  return {
    ...base,
    state: 'ok',
    detail: `${currentPeriod.value} 學期費用單已全數收齊`,
    actionLabel: '查看',
  }
}

const queueItems = computed<QueueItem[]>(() => [
  bankItem(),
  handoverItem(),
  refundItem(),
  closeItem(),
  billingItem(),
])
</script>

<style scoped>
.fee-workbench {
  max-width: 880px;
}

.context-line {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.queue-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.row-status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

.row-status__icon {
  font-size: 18px;
}

.row-status[data-state='ok'] .row-status__icon {
  color: var(--el-color-success);
}

.row-status[data-state='action'] .row-status__icon {
  color: var(--el-color-warning);
}

.row-status[data-state='muted'] .row-status__icon,
.row-status[data-state='unknown'] .row-status__icon {
  color: var(--el-text-color-placeholder);
}

.row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-title {
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--el-text-color-primary);
}

.row-detail {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.row-action {
  flex-shrink: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (--to-sm) {
  .queue-row {
    flex-wrap: wrap;
  }
  .row-action {
    margin-left: calc(18px + var(--space-3));
  }
}
</style>
