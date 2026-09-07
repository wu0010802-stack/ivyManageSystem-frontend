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
 *
 * 2026-09-07 bug hunt 修正（八項都是「有事要做卻報綠燈」）：
 * - 待辦判定一律與後端 close 檢查同軸：代收／存摺查 status=pending（四個未結
 *   狀態），不是只查 imported；存摺不再用「本月」closeSummary 而是全期間列表，
 *   否則跨月遺留的未分類交易永遠不會提示。
 * - 發單批次改看 unresolved_count：產過單不代表沒漏單（略過未解析的學生）。
 * - 現金交接看的是「所有未結批次」而非只有今天那一筆。
 * - 預繳退款導向現金項目（PrepaymentRefundsDialog 的所在），不是費用單退費頁。
 * - 關帳改盯「上個月」：本月還沒結束就催關帳，而關帳會 409 鎖死當月後續入帳。
 * - 快取有 TTL 且隨身分切換清空（原本離開 /fees 再回來永遠是舊數字）。
 * - 載入失敗的項目另立分組並辨識 403，不再混進「沒有待辦」。
 */
import { computed, reactive, ref } from 'vue'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { getCurrentAcademicTerm } from '@/utils/academic'
import {
  getBankTransactions,
  getBillSlipBatches,
  getCashHandovers,
  getClosePeriods,
  getCloseSummary,
  getCollectionPayments,
  getFeePeriods,
  getFeeSummary,
} from '@/api/fees'
import { onAdminSessionReset } from '@/utils/adminSession'
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
  /** 檢核檔姓名對不上在籍學生、產單時被略過的非零元列（＝這些學生永久沒有費用單） */
  unresolved_count?: number
  unresolved_amount?: number
}

/** 待辦數字最多沿用這麼久；超過就重抓（離開 /fees 再回來要拿得到新數字） */
const STALE_AFTER_MS = 60_000

/** 未結交接批：draft／reopened＝會計還沒提交，submitted＝老闆還沒簽收 */
const HANDOVER_PENDING_STATUSES = new Set(['draft', 'reopened', 'submitted'])

// ── module scope 共用狀態（工作台與主導航頁籤共用一次載入）────────────────
const state = reactive({
  loading: true,
  loadedOnce: false,
  /** 上次載入完成的時間戳（Date.now）；配合 STALE_AFTER_MS 決定要不要重抓 */
  loadedAt: 0,
  /** 這輪載入有沒有任何一支被後端以 403 擋下（權限不足，不是系統故障） */
  forbidden: false,
  closeSummary: null as CloseSummaryLite | null,
  todayHandover: null as HandoverLite | null,
  pendingHandovers: [] as HandoverLite[],
  handoversLoaded: false,
  currentPeriod: null as string | null,
  feeSummary: null as FeeSummaryLite | null,
  feeSummaryLoaded: false,
  monthClosed: null as boolean | null,
  prevMonthClosed: null as boolean | null,
  billSlips: null as {
    total: number
    pending: number
    pendingAmount: number
    unresolved: number
    unresolvedAmount: number
  } | null,
  collectionPending: null as number | null,
  passbookPending: null as number | null,
})

/** axios 錯誤是不是 403（權限不足）——用來把「你沒有權限」與「系統壞了」分開講 */
function isForbidden(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status
  return status === 403
}

function noteFailure(err: unknown): void {
  if (isForbidden(err)) state.forbidden = true
}

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
  } catch (err) {
    noteFailure(err)
    state.closeSummary = null // 降級：不顯示數字，只留入口
  }
}

// 只看「今天」會把前幾天卡在草稿／待簽收的現金整批藏起來（staging 實測：
// 09-03 的 NT$13,000 draft 一直掛著，工作台卻寫「今日尚無現金收款」無待辦，
// 而同一份資料在關帳檢查裡是紅的）。改為收下所有未結批次。
async function loadHandovers() {
  try {
    const data = await getCashHandovers()
    const items = (data.items ?? []) as HandoverLite[]
    state.todayHandover = items.find((b) => b.business_date === currentToday()) ?? null
    state.pendingHandovers = items.filter((b) =>
      HANDOVER_PENDING_STATUSES.has(b.status),
    )
    state.handoversLoaded = true
  } catch (err) {
    noteFailure(err)
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
  } catch (err) {
    noteFailure(err)
    state.feeSummaryLoaded = false
  }
}

async function loadMonthClosed() {
  const [y, m] = monthLabel.value.split('-').map(Number)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  try {
    const data = await getClosePeriods()
    const items = (data.items ?? []) as ClosePeriodLite[]
    const closed = (yy: number, mm: number) =>
      items.some(
        (row) =>
          row.close_year === yy && row.close_month === mm && row.status === 'closed',
      )
    state.monthClosed = closed(y, m)
    state.prevMonthClosed = closed(prevY, prevM)
  } catch (err) {
    noteFailure(err)
    state.monthClosed = null
    state.prevMonthClosed = null
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
    // 產過單 ≠ 沒漏單：勾「略過未解析」跳過的學生（檢核檔姓名對不上在籍
    // 學生）永遠沒有費用單，而批次的 records_generated_count 仍 > 0。
    state.billSlips = {
      total: rows.length,
      pending: pendingRows.length,
      pendingAmount: pendingRows.reduce((sum, r) => sum + (r.net_total ?? 0), 0),
      unresolved: rows.reduce((sum, r) => sum + (r.unresolved_count ?? 0), 0),
      unresolvedAmount: rows.reduce((sum, r) => sum + (r.unresolved_amount ?? 0), 0),
    }
  } catch (err) {
    noteFailure(err)
    state.billSlips = null
  }
}

// 待處理筆數：只取分頁 total，不拉明細（page_size=1）。
// status=pending 是後端的聚合值＝close 檢查認定的四個未結狀態
// （imported / suggested / unmatched / partially_allocated）；只查 imported
// 會把「部分分配」等仍有未分配餘額的錢算成完成。
async function loadCollectionPending() {
  try {
    const data = (await getCollectionPayments({
      status: 'pending',
      page: 1,
      page_size: 1,
    })) as unknown as { total?: number }
    state.collectionPending = data.total ?? 0
  } catch (err) {
    noteFailure(err)
    state.collectionPending = null
  }
}

// 存摺待分類改打列表端點（全期間）而非 closeSummary（本月）：目的地頁列的是
// 全期間，用本月口徑會讓跨月遺留的未分類交易在工作台永遠顯示「已全數分類」。
async function loadPassbookPending() {
  try {
    const data = (await getBankTransactions({
      status: 'pending',
      page: 1,
      page_size: 1,
    })) as unknown as { total?: number }
    state.passbookPending = data.total ?? 0
  } catch (err) {
    noteFailure(err)
    state.passbookPending = null
  }
}

async function loadAll(initial: boolean) {
  if (initial) state.loading = true
  today.value = todayISO()
  state.forbidden = false
  await Promise.allSettled([
    loadCloseSummary(),
    loadHandovers(),
    loadFeeSummary(),
    loadMonthClosed(),
    loadBillSlips(),
    loadCollectionPending(),
    loadPassbookPending(),
  ])
  state.loading = false
  state.loadedOnce = true
  state.loadedAt = Date.now()
}

/**
 * 首次載入；已有資料但超過 STALE_AFTER_MS 就重抓（不閃 skeleton）。
 *
 * 舊版只看 loadedOnce，於是使用者離開 /fees 去別的模組處理完事情再回來時，
 * 元件雖重新 mount 卻一支 API 都不打，畫面停在上次進站的數字（連「今天」
 * 那行都是舊的），只能整頁重新整理。
 */
function ensureLoaded(): Promise<void> {
  if (inflight) return inflight
  if (state.loadedOnce && Date.now() - state.loadedAt < STALE_AFTER_MS) {
    return Promise.resolve()
  }
  const initial = !state.loadedOnce
  inflight = loadAll(initial).finally(() => {
    inflight = null
  })
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

/**
 * 清空 module scope 狀態。
 *
 * 除了測試，**身分切換時一定要跑**：state 活在 module scope，登出後同一個
 * 分頁換人登入時 SPA 不會 reload，前一位使用者的全校金額會直接顯示給下一位
 * （包含後端會 403 拒絕他的那些數字）。
 */
export function __resetFeeOverview() {
  state.loading = true
  state.loadedOnce = false
  state.loadedAt = 0
  state.forbidden = false
  state.closeSummary = null
  state.todayHandover = null
  state.pendingHandovers = []
  state.handoversLoaded = false
  state.currentPeriod = null
  state.feeSummary = null
  state.feeSummaryLoaded = false
  state.monthClosed = null
  state.prevMonthClosed = null
  state.billSlips = null
  state.collectionPending = null
  state.passbookPending = null
  today.value = ''
  inflight = null
}

// login / logout / impersonate 都會發這個事件（local）；另一分頁換身分為 remote。
onAdminSessionReset(__resetFeeOverview)

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
      detail: '銀行代收已入帳但尚未分配完畢（含部分分配）',
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
  const pending = state.passbookPending
  if (pending == null) {
    return { ...base, state: 'unknown', detail: '無法載入存摺交易，點入入帳媒合查看' }
  }
  if (pending > 0) {
    return {
      ...base,
      state: 'action',
      // 金額未知（只取了 total），以筆數當排序權重的下界
      amount: 1,
      title: `存摺交易 ${pending} 筆待分類`,
      detail: '銀行存摺已入帳但尚未分類或分配完畢',
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

/**
 * 現金交接。
 *
 * 只看「今天」是原本的漏報來源：前幾天卡在草稿或待簽收的整批現金完全不會
 * 出現在待辦（staging 實測 09-03 的 NT$13,000 draft 掛了四天，工作台寫
 * 「今日尚無現金收款」判無待辦，而同一份資料在關帳檢查裡是紅的）。
 * 這裡看的是所有未結批次；今天那筆若也未結，文案沿用原本的狀態措辭。
 */
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
  const pending = state.pendingHandovers
  const today = state.todayHandover
  const todayPending =
    today && HANDOVER_PENDING_STATUSES.has(today.status) ? today : null

  if (pending.length > 0) {
    const amount = pending.reduce((sum, b) => sum + (b.cash_receipt_total ?? 0), 0)
    const olderDates = pending
      .filter((b) => b.business_date !== currentToday())
      .map((b) => b.business_date)
      .sort()
    const awaitingOwner = pending.filter((b) => b.status === 'submitted')
    // 全部都待簽收 → 動作在老闆身上；只要有一筆還沒提交，動作在會計身上
    const allAwaitingOwner = awaitingOwner.length === pending.length
    const olderNote = olderDates.length
      ? `含 ${olderDates[0]}${olderDates.length > 1 ? ` 等 ${olderDates.length} 天` : ''} 的舊批次`
      : ''
    if (allAwaitingOwner) {
      return {
        ...base,
        state: 'action',
        amount,
        title: `現金 ${formatCurrency(amount)} 待老闆簽收`,
        detail: olderNote || '簽收後本月才能關帳',
        actionLabel: '去簽收',
      }
    }
    return {
      ...base,
      state: 'action',
      amount,
      title: todayPending
        ? `現金 ${formatCurrency(amount)} 尚未完成交接`
        : `${formatCurrency(amount)} 的現金交接未完成`,
      detail: olderNote || '提交後由老闆簽收',
    }
  }

  if (!today) {
    return {
      ...base,
      state: 'muted',
      title: '今日尚無現金收款',
      detail: '收到現金時到「結算 › 每日交接」登記',
      actionLabel: '去登記',
    }
  }
  const varianceNote =
    today.variance != null && today.variance !== 0
      ? `簽收差異 ${formatCurrency(today.variance)}`
      : ''
  return {
    ...base,
    state: 'ok',
    title: '今日交接已完成',
    detail: varianceNote,
    actionLabel: '查看',
  }
}

/**
 * 預繳退款（PrepaymentCashRefund，狀態 requested／approved）。
 *
 * ⚠ 目的地是「收款 › 現金項目」而不是「收款 › 退款」：後者是費用單退費
 * （FeeRefundsTab 打 /fees/refunds），完全不列預繳退款；預繳退款的核准與
 * 交付介面是 CashItemsView 裡的 PrepaymentRefundsDialog。導錯頁會讓使用者
 * 找不到東西，而 no_pending_refunds 又是關帳阻擋項。
 */
function refundItem(): FeeQueueItem {
  const base = {
    key: 'refunds',
    title: '預繳退款',
    actionLabel: '去處理',
    target: { ws: 'billing' as FeeWorkspaceKey, view: 'cashItems' },
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
      detail: '在「現金項目 › 預繳款」的退款清單核准或交付現金',
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

/** 上一個月的 YYYY-MM（關帳的實際對象） */
function prevMonthLabel(): string {
  const [y, m] = monthLabel.value.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * 關帳。
 *
 * ⚠ 催的對象是**上個月**，不是本月。關帳會寫入 close period，之後該月的
 * 所有入帳／分配／沖銷一律被後端 assert_month_open 擋成 409，必須 reopen
 * 才能繼續。舊版在 checklist 全過時把「本月可以關帳」標成待處理，等於從
 * 每月 1 號就把一個會癱瘓當月收款的動作置頂催促（結算頁籤的紅徽章也因此
 * 整個月不可能歸零）。本月只呈現進度，不催。
 */
function closeItem(): FeeQueueItem {
  const base = {
    key: 'close',
    title: '本月關帳',
    actionLabel: '去月結',
    target: { ws: 'settlement' as FeeWorkspaceKey, view: 'close' },
    amount: 0,
  }
  if (state.monthClosed === null) {
    return { ...base, state: 'unknown', detail: '無法載入關帳紀錄，點入月結查看' }
  }
  if (state.prevMonthClosed === false) {
    return {
      ...base,
      state: 'action',
      title: `上個月（${prevMonthLabel()}）尚未關帳`,
      detail: '月份已結束，關帳後快照凍結',
    }
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
  return {
    ...base,
    state: 'muted',
    title: '本月進行中',
    detail:
      failing > 0
        ? `關帳前檢查目前 ${failing} 項未通過；月底結束後再關帳`
        : '關帳前檢查全數通過；月底結束後再關帳',
    actionLabel: '查看',
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
  // 產過單不代表沒漏單：檢核檔姓名對不上在籍學生的列被略過後，那些學生
  // 永遠沒有費用單，也不會出現在應收帳款或未繳名單裡。
  if (s.unresolved > 0) {
    return {
      ...base,
      state: 'action',
      amount: s.unresolvedAmount,
      title: `發單批次有 ${s.unresolved} 名學生未產生費用單`,
      detail:
        `檢核檔姓名對不上在籍學生，合計 ${formatCurrency(s.unresolvedAmount)}；` +
        '到匯入紀錄逐列指定學生後重新產單',
      actionLabel: '去指定',
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

  /**
   * 載入失敗（403／500）的列。刻意與 restItems 分開：舊版把它們混進寫死的
   * 「沒有待辦」分組標題底下，七支 API 全掛時整頁讀起來像一切正常。
   */
  const unknownItems = computed(() =>
    allItems.value
      .filter((i) => i.state === 'unknown')
      .sort((a, b) => RESIDUAL_ORDER.indexOf(a.key) - RESIDUAL_ORDER.indexOf(b.key)),
  )

  const restItems = computed(() =>
    allItems.value
      .filter((i) => i.state !== 'action' && i.state !== 'unknown')
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
    queueItems: computed(() => [
      ...actionItems.value,
      ...restItems.value,
      ...unknownItems.value,
    ]),
    actionItems,
    restItems,
    unknownItems,
    /** 這輪載入有 403：畫面要說「你沒有權限」而不是「無法載入」 */
    forbidden: computed(() => state.forbidden),
    todoCounts,
    /** 發單批次待產單數（應收帳款頂端提示條用） */
    pendingBillSlips: computed(() => state.billSlips?.pending ?? 0),
    pendingBillSlipAmount: computed(() => state.billSlips?.pendingAmount ?? 0),
    ensureLoaded,
    refresh,
  }
}
