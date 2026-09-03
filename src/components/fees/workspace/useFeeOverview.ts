/**
 * 學費管理待辦總覽（2026-09-02 簡化改版）。
 *
 * 原本這批載入只服務工作台一處；改版後主導航頁籤也要顯示各工作區的待辦數，
 * 若兩邊各載一次就會對同一組唯讀 API 打兩輪。因此把載入與衍生邏輯抽到這裡，
 * 以 module scope 共用同一份狀態（單一 in-flight promise 去重），
 * 工作台與 StudentFeeView 都消費它。
 *
 * 資料源全部是既有唯讀 API，失敗逐項降級（拿不到可靠數字的項目只顯示狀態與
 * 入口，絕不顯示推估／假數字）。佇列不含任何學生姓名等 PII，只有聚合計數與金額。
 */
import { computed, reactive, ref } from 'vue'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { getCurrentAcademicTerm } from '@/utils/academic'
import {
  getBillSlipBatches,
  getCashHandovers,
  getClosePeriods,
  getCloseSummary,
  getCollectionPayments,
  getFeePeriods,
  getFeeSummary,
} from '@/api/fees'
import type { FeeNavTarget, FeeWorkspaceKey } from './feesNavigation'

export type FeeQueueState = 'ok' | 'action' | 'muted' | 'unknown'

export interface FeeQueueItem {
  key: string
  title: string
  detail: string
  state: FeeQueueState
  actionLabel: string
  target: FeeNavTarget
  /** 待處理金額，用於「金額大的排前面」；無金額語意者為 0 */
  amount: number
}

export const FEE_QUEUE_STATE_TEXT: Record<FeeQueueState, string> = {
  ok: '已完成',
  action: '待處理',
  muted: '無待辦',
  unknown: '狀態未知',
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
interface BillSlipBatchLite {
  net_total: number
  records_generated_count: number
}

// ── module scope 共用狀態（工作台與主導航頁籤共用一次載入）────────────────
const state = reactive({
  loading: true,
  loadedOnce: false,
  closeSummary: null as CloseSummaryLite | null,
  todayHandover: null as HandoverLite | null,
  handoversLoaded: false,
  currentPeriod: null as string | null,
  feeSummary: null as FeeSummaryLite | null,
  feeSummaryLoaded: false,
  monthClosed: null as boolean | null,
  billSlips: null as { total: number; pending: number; pendingAmount: number } | null,
  collectionPending: null as number | null,
})

// 刻意不在 module 載入當下就求值：一來長開的分頁跨午夜後日期會凍住，
// 二來 import 時取值會早於測試的 vi.mock('@/utils/format') 生效時機。
const today = ref('')
function currentToday(): string {
  if (!today.value) today.value = todayISO()
  return today.value
}
const monthLabel = computed(() => currentToday().slice(0, 7))

let inflight: Promise<void> | null = null

async function loadCloseSummary() {
  const [y, m] = monthLabel.value.split('-').map(Number)
  try {
    state.closeSummary = (await getCloseSummary(y, m)) as unknown as CloseSummaryLite
  } catch {
    state.closeSummary = null // 降級：不顯示數字，只留入口
  }
}

async function loadTodayHandover() {
  try {
    const data = await getCashHandovers()
    const items = (data.items ?? []) as HandoverLite[]
    state.todayHandover = items.find((b) => b.business_date === currentToday()) ?? null
    state.handoversLoaded = true
  } catch {
    state.handoversLoaded = false
  }
}

async function loadFeeSummary() {
  try {
    const periods = ((await getFeePeriods()) as string[]) ?? []
    const term = getCurrentAcademicTerm()
    const termPeriod = `${term.school_year}-${term.semester}`
    state.currentPeriod = periods.includes(termPeriod) ? termPeriod : (periods[0] ?? null)
    if (!state.currentPeriod) {
      state.feeSummaryLoaded = true // 查得到 periods、但一筆都沒有＝尚未產單
      return
    }
    state.feeSummary = (await getFeeSummary({
      period: state.currentPeriod,
    })) as FeeSummaryLite
    state.feeSummaryLoaded = true
  } catch {
    state.feeSummaryLoaded = false
  }
}

async function loadMonthClosed() {
  const [y, m] = monthLabel.value.split('-').map(Number)
  try {
    const data = await getClosePeriods()
    const items = (data.items ?? []) as ClosePeriodLite[]
    state.monthClosed = items.some(
      (row) => row.close_year === y && row.close_month === m && row.status === 'closed',
    )
  } catch {
    state.monthClosed = null
  }
}

// SPEC-018：發單批次（XLS 檢核檔）是月費應收權威；匯入後未產生費用單＝
// 收款與代收核銷都沒有正確金額的單可對，屬待辦。
async function loadBillSlips() {
  try {
    const rows = (await getBillSlipBatches()) as unknown as BillSlipBatchLite[]
    const pendingRows = rows.filter(
      (r) => r.net_total > 0 && r.records_generated_count === 0,
    )
    state.billSlips = {
      total: rows.length,
      pending: pendingRows.length,
      pendingAmount: pendingRows.reduce((sum, r) => sum + (r.net_total ?? 0), 0),
    }
  } catch {
    state.billSlips = null
  }
}

// 代收明細待媒合筆數：只取分頁 total，不拉明細（page_size=1）
async function loadCollectionPending() {
  try {
    const data = (await getCollectionPayments({
      status: 'imported',
      page: 1,
      page_size: 1,
    })) as unknown as { total?: number }
    state.collectionPending = data.total ?? 0
  } catch {
    state.collectionPending = null
  }
}

async function loadAll(initial: boolean) {
  if (initial) state.loading = true
  today.value = todayISO()
  await Promise.allSettled([
    loadCloseSummary(),
    loadTodayHandover(),
    loadFeeSummary(),
    loadMonthClosed(),
    loadBillSlips(),
    loadCollectionPending(),
  ])
  state.loading = false
  state.loadedOnce = true
}

/** 首次載入（重複呼叫共用同一個 in-flight promise，不會重打 API） */
function ensureLoaded(): Promise<void> {
  if (state.loadedOnce) return Promise.resolve()
  if (!inflight) {
    inflight = loadAll(true).finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** 重新整理（不閃 skeleton）；已在載入中時共用同一輪 */
function refresh(): Promise<void> {
  if (inflight) return inflight
  inflight = loadAll(false).finally(() => {
    inflight = null
  })
  return inflight
}

/** 測試用：清空 module scope 狀態 */
export function __resetFeeOverview() {
  state.loading = true
  state.loadedOnce = false
  state.closeSummary = null
  state.todayHandover = null
  state.handoversLoaded = false
  state.currentPeriod = null
  state.feeSummary = null
  state.feeSummaryLoaded = false
  state.monthClosed = null
  state.billSlips = null
  state.collectionPending = null
  today.value = ''
  inflight = null
}

// ── 佇列項目 ──────────────────────────────────────────────────────────────

function receivableItem(): FeeQueueItem {
  const base = {
    key: 'receivable',
    title: '本學期費用單',
    actionLabel: '去收款',
    target: { ws: 'billing' as FeeWorkspaceKey, view: 'receivable' },
    amount: 0,
  }
  if (!state.feeSummaryLoaded) {
    return { ...base, state: 'unknown', detail: '無法載入收款統計，點入應收帳款查看' }
  }
  if (!state.currentPeriod) {
    // SPEC-019：應收唯一來源＝發單批次（銀行檢核檔）與現金項目批次；範本產單已退場
    return {
      ...base,
      state: 'muted',
      detail:
        '尚未產生任何費用單；請匯入銀行繳款單檢核檔建立發單批次，或到現金項目建立教材費等批次',
      actionLabel: '去匯入',
      target: { ws: 'billing', view: 'receivable', imports: true },
    }
  }
  const s = state.feeSummary
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入收款統計，點入應收帳款查看' }
  }
  const outstanding = s.unpaid_count + s.partial_count
  if (outstanding > 0) {
    return {
      ...base,
      state: 'action',
      amount: s.total_unpaid,
      title: `本學期費用單 ${outstanding} 筆未收齊`,
      detail: `${state.currentPeriod} 學期未收 ${formatCurrency(s.total_unpaid)}`,
    }
  }
  return {
    ...base,
    state: 'ok',
    title: '本學期費用單已全數收齊',
    detail: `${state.currentPeriod} 學期`,
    actionLabel: '查看',
  }
}

function collectionItem(): FeeQueueItem {
  const base = {
    key: 'collection',
    title: '代收明細',
    actionLabel: '去媒合',
    target: { ws: 'billing' as FeeWorkspaceKey, view: 'matching', src: 'collection' },
    amount: 0,
  }
  const pending = state.collectionPending
  if (pending == null) {
    return { ...base, state: 'unknown', detail: '無法載入代收明細，點入入帳媒合查看' }
  }
  if (pending > 0) {
    return {
      ...base,
      state: 'action',
      // 金額未知（只取了 total），以筆數當排序權重的下界，確保排在無金額項之前
      amount: 1,
      title: `代收明細 ${pending} 筆待媒合`,
      detail: '銀行代收已入帳但尚未分配到費用單',
    }
  }
  return {
    ...base,
    state: 'ok',
    title: '代收明細已全數媒合',
    detail: '',
    actionLabel: '查看',
  }
}

function passbookItem(): FeeQueueItem {
  const base = {
    key: 'passbook',
    title: '存摺交易',
    actionLabel: '去分類',
    target: { ws: 'billing' as FeeWorkspaceKey, view: 'matching', src: 'passbook' },
    amount: 0,
  }
  const s = state.closeSummary
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入本月統計，點入入帳媒合查看' }
  }
  const pending = s.bank.unclassified_count
  if (pending > 0) {
    return {
      ...base,
      state: 'action',
      amount: s.bank.unallocated,
      title: `存摺交易 ${pending} 筆待分類`,
      detail: `未分配 ${formatCurrency(s.bank.unallocated)}`,
    }
  }
  return {
    ...base,
    state: 'ok',
    title: '存摺交易已全數分類',
    detail: '',
    actionLabel: '查看',
  }
}

function handoverItem(): FeeQueueItem {
  const base = {
    key: 'handover',
    title: '今日現金交接',
    actionLabel: '去交接',
    target: { ws: 'settlement' as FeeWorkspaceKey, view: 'handover' },
    amount: 0,
  }
  if (!state.handoversLoaded) {
    return { ...base, state: 'unknown', detail: '無法載入交接狀態，點入每日交接查看' }
  }
  const batch = state.todayHandover
  if (!batch) {
    return {
      ...base,
      state: 'muted',
      title: '今日尚無現金收款',
      detail: '收到現金時到「結算 › 每日交接」登記',
      actionLabel: '去登記',
    }
  }
  if (batch.status === 'draft' || batch.status === 'reopened') {
    return {
      ...base,
      state: 'action',
      amount: batch.cash_receipt_total,
      title: `今日現金 ${formatCurrency(batch.cash_receipt_total)} 尚未提交交接`,
      detail: '提交後由老闆簽收',
    }
  }
  if (batch.status === 'submitted') {
    return {
      ...base,
      state: 'action',
      amount: batch.cash_receipt_total,
      title: `現金 ${formatCurrency(batch.cash_receipt_total)} 待老闆簽收`,
      detail: '簽收後本月才能關帳',
      actionLabel: '去簽收',
    }
  }
  const varianceNote =
    batch.variance != null && batch.variance !== 0
      ? `，簽收差異 ${formatCurrency(batch.variance)}`
      : ''
  return {
    ...base,
    state: 'ok',
    title: '今日交接已完成',
    detail: varianceNote ? varianceNote.replace(/^，/, '') : '',
    actionLabel: '查看',
  }
}

function refundItem(): FeeQueueItem {
  const base = {
    key: 'refunds',
    title: '預繳退款',
    actionLabel: '去處理',
    target: { ws: 'billing' as FeeWorkspaceKey, view: 'refunds' },
    amount: 0,
  }
  const s = state.closeSummary
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入退款狀態，點入退款查看' }
  }
  const pending = s.owner.pending_refunds
  if (pending > 0) {
    return {
      ...base,
      state: 'action',
      amount: 1,
      title: `預繳退款 ${pending} 筆待處理`,
      detail: '待核准或交付現金',
    }
  }
  return {
    ...base,
    state: 'ok',
    title: '沒有待處理的預繳退款',
    detail: '',
    actionLabel: '查看',
  }
}

function closeItem(): FeeQueueItem {
  const base = {
    key: 'close',
    title: '本月關帳',
    actionLabel: '去月結',
    target: { ws: 'settlement' as FeeWorkspaceKey, view: 'close' },
    amount: 0,
  }
  if (state.monthClosed === true) {
    return {
      ...base,
      state: 'ok',
      title: '本月已關帳',
      detail: '快照已凍結',
      actionLabel: '查看',
    }
  }
  const s = state.closeSummary
  if (!s) {
    return { ...base, state: 'unknown', detail: '無法載入關帳檢查，點入月結查看' }
  }
  const failing = Object.values(s.checklist).filter((ok) => !ok).length
  if (failing > 0) {
    return {
      ...base,
      state: 'action',
      title: `本月關帳有 ${failing} 項檢查未通過`,
      detail: '逐項修正後才能直接關帳',
      actionLabel: '去修正',
    }
  }
  return {
    ...base,
    state: 'action',
    title: '本月可以關帳',
    detail: '關帳前檢查全數通過',
  }
}

function slipGenItem(): FeeQueueItem {
  const base = {
    key: 'billslips',
    title: '發單批次',
    actionLabel: '去產單',
    target: { ws: 'billing' as FeeWorkspaceKey, view: 'receivable', imports: true },
    amount: 0,
  }
  const s = state.billSlips
  if (!s) {
    return {
      ...base,
      state: 'unknown',
      detail: '無法載入發單批次，點入匯入紀錄查看',
      actionLabel: '查看',
    }
  }
  if (s.total === 0) {
    return {
      ...base,
      state: 'muted',
      title: '尚無發單批次',
      detail: '匯入繳款單檢核檔（Check_*.xls）即可一鍵產生費用單',
      actionLabel: '去匯入',
    }
  }
  if (s.pending > 0) {
    return {
      ...base,
      state: 'action',
      amount: s.pendingAmount,
      title: `發單批次尚未產生費用單`,
      detail: `${s.pending} 個批次已匯入，應收合計 ${formatCurrency(s.pendingAmount)}`,
    }
  }
  return {
    ...base,
    state: 'ok',
    title: '發單批次皆已產生費用單',
    detail: '',
    actionLabel: '查看',
  }
}

/** 佇列排序：待處理在最前（金額大者優先），其餘照固定順序排在後面 */
const RESIDUAL_ORDER = ['collection', 'passbook', 'refunds', 'receivable', 'billslips', 'close', 'handover']

export function useFeeOverview() {
  const allItems = computed<FeeQueueItem[]>(() => [
    receivableItem(),
    collectionItem(),
    passbookItem(),
    slipGenItem(),
    handoverItem(),
    refundItem(),
    closeItem(),
  ])

  const actionItems = computed(() =>
    allItems.value
      .filter((i) => i.state === 'action')
      .sort((a, b) => b.amount - a.amount),
  )

  const restItems = computed(() =>
    allItems.value
      .filter((i) => i.state !== 'action')
      .sort((a, b) => RESIDUAL_ORDER.indexOf(a.key) - RESIDUAL_ORDER.indexOf(b.key)),
  )

  /**
   * 主導航頁籤的待辦數＝該工作區的「待處理」項目數。
   * 刻意不用未收筆數（62）這類業務量級數字：頁籤徽章的通用語意是
   * 「這裡有幾件事要處理」，兩種量級混在同一列會誤讀。
   */
  const todoCounts = computed<Record<FeeWorkspaceKey, number>>(() => {
    const counts = { workbench: 0, billing: 0, settlement: 0 }
    for (const item of actionItems.value) counts[item.target.ws] += 1
    return counts
  })

  return {
    loading: computed(() => state.loading),
    loadedOnce: computed(() => state.loadedOnce),
    today: computed(() => currentToday()),
    monthLabel,
    queueItems: computed(() => [...actionItems.value, ...restItems.value]),
    actionItems,
    restItems,
    todoCounts,
    /** 發單批次待產單數（應收帳款頂端提示條用） */
    pendingBillSlips: computed(() => state.billSlips?.pending ?? 0),
    pendingBillSlipAmount: computed(() => state.billSlips?.pendingAmount ?? 0),
    ensureLoaded,
    refresh,
  }
}
