/**
 * 審核工作台「其他待簽」區塊的資料層（後台 IA 重整 W2，2026-10-29）。
 *
 * 工作台只處理請假／加班／補打卡；考核、收付款、學費月結、POS 日結的簽核在各自頁面，
 * 這裡集中顯示「有幾件在等」並連到原頁。規則：
 * - 可見性 = 原頁的路由 gate（canAccessRoute），與側欄、路由守衛同一份規則。
 * - 計數只用前端已存在的 API，且只取摘要／帶 total 的端點，不為了算數字撈整份清單。
 * - 載入失敗不吞：狀態為 error（畫面顯示「—」並保留連結），絕不當成 0。
 * - 沒有權限取數（頁面看得到、但摘要端點要別的碼）→ none，只放連結。
 */
import { computed, reactive, ref } from 'vue'
import { canAccessRoute, hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { todayTaipeiISO } from '@/utils/format'
import { getAppraisalCurrentCycle, getSignStatusSummary } from '@/api/appraisal'
import { getVendorPaymentSummary } from '@/api/vendorPayment'
import { getMiscReceiptSummary } from '@/api/miscReceipt'
import { getCashHandovers, getCloseSummary, getClosePeriods } from '@/api/fees'
import { getPOSDailyClosePending } from '@/api/activity'

export type SignoffCount =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ok'; count: number; detail: string }
  | { status: 'error' }

export interface OtherSignoffItem {
  key: OtherSignoffKey
  title: string
  hint: string
  /** 計數單位（顯示成「N 日」「N 筆」） */
  unit: string
  /** 原頁路徑；可見性也由它決定 */
  to: string
  count: SignoffCount
}

export type OtherSignoffKey = 'appraisal' | 'finance' | 'fees-close' | 'pos-daily-close'

interface Loaded {
  count: number
  detail: string
}

interface Def {
  key: OtherSignoffKey
  title: string
  hint: string
  unit: string
  to: string
  /** 回 null＝這個使用者沒有可用的計數來源（只放連結）；throw＝載入失敗 */
  load: () => Promise<Loaded | null>
}

/** 後端回應欄位形狀不符時當成失敗，不要默默補 0。 */
function requireNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${what} 回應格式不符`)
  }
  return value
}

async function loadAppraisal(): Promise<Loaded | null> {
  // 當期簽核狀態端點掛 APPRAISAL_READ；只持其他碼進得了待辦頁的人沒有計數來源
  if (!hasPermission(PERMISSION_NAMES.APPRAISAL_READ)) return null
  const cycle = (await getAppraisalCurrentCycle()).data
  if (!cycle) return { count: 0, detail: '目前沒有進行中的考核週期' }
  const counts = (await getSignStatusSummary(cycle.id)).data.counts ?? {}
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const pending = total - (counts.FINALIZED ?? 0)
  const semester = cycle.semester === 'FIRST' ? '上' : '下'
  return { count: pending, detail: `${cycle.academic_year} 學年${semester}學期，尚未核定的考核` }
}

async function loadFinance(): Promise<Loaded | null> {
  const sources: { label: string; call: () => Promise<{ data: unknown }> }[] = []
  if (hasPermission(PERMISSION_NAMES.VENDOR_PAYMENT_READ)) {
    sources.push({ label: '廠商付款', call: () => getVendorPaymentSummary() })
  }
  if (hasPermission(PERMISSION_NAMES.MISC_RECEIPT_READ)) {
    sources.push({ label: '雜項收款', call: () => getMiscReceiptSummary() })
  }
  if (sources.length === 0) return null
  const results = await Promise.allSettled(sources.map((s) => s.call()))
  const parts: string[] = []
  let total = 0
  results.forEach((result, i) => {
    if (result.status === 'rejected') throw result.reason
    const n = requireNumber(
      (result.value.data as { pending_approval_count?: unknown }).pending_approval_count,
      `${sources[i]!.label}摘要`,
    )
    total += n
    parts.push(`${sources[i]!.label} ${n}`)
  })
  return { count: total, detail: `待核准：${parts.join('、')}` }
}

interface ClosePeriodRow {
  close_year: number
  close_month: number
  status: string
}

async function loadFeesClose(): Promise<Loaded | null> {
  const [year, month] = todayTaipeiISO().slice(0, 7).split('-').map(Number) as [number, number]
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  // 三支都是學費「結算」頁既有的摘要／帶 total 的呼叫（現金交接 limit=1 只取 total）。
  const [handovers, closeSummary, periods] = await Promise.all([
    getCashHandovers({ status: 'submitted', limit: 1 }),
    getCloseSummary(year, month),
    getClosePeriods(),
  ])
  const submitted = requireNumber((handovers as { total?: unknown }).total, '現金交接')
  const refunds = requireNumber(
    (closeSummary as unknown as { owner?: { pending_refunds?: unknown } }).owner?.pending_refunds,
    '關帳摘要',
  )
  const rows = ((periods as { items?: unknown }).items ?? []) as ClosePeriodRow[]
  const prevClosed = rows.some(
    (r) => r.close_year === prevYear && r.close_month === prevMonth && r.status === 'closed',
  )
  const parts: string[] = []
  if (!prevClosed) parts.push(`上個月（${prevYear}-${String(prevMonth).padStart(2, '0')}）尚未關帳`)
  if (submitted > 0) parts.push(`現金交接 ${submitted} 批待簽收`)
  if (refunds > 0) parts.push(`預繳退款 ${refunds} 筆待處理`)
  return {
    count: (prevClosed ? 0 : 1) + submitted + refunds,
    detail: parts.length > 0 ? parts.join('、') : '沒有待老闆簽核的項目',
  }
}

async function loadPosDailyClose(): Promise<Loaded | null> {
  const data = (await getPOSDailyClosePending()).data
  const older = data.older_pending_count ?? 0
  const recent = (data.pending ?? []).length
  return {
    count: recent + older,
    detail:
      older > 0
        ? `近期 ${recent} 日，另有 ${older} 天更早的未簽核日（最早 ${data.oldest_pending_date ?? '—'}）`
        : '有交易但尚未簽核的日結',
  }
}

const DEFS: Def[] = [
  {
    key: 'appraisal',
    title: '考核待辦',
    hint: '目前考核週期尚未核定的人數，待辦清單在考核與年終的待辦頁',
    unit: '人',
    to: '/appraisal-year-end/todo',
    load: loadAppraisal,
  },
  {
    key: 'finance',
    title: '收付款待簽核',
    hint: '廠商付款與雜項收款等待核准的單據',
    unit: '筆',
    to: '/finance-signoffs',
    load: loadFinance,
  },
  {
    key: 'fees-close',
    title: '學費月結待核准',
    hint: '老闆簽核項目：上月關帳、現金交接簽收、預繳退款',
    unit: '項',
    to: '/fees',
    load: loadFeesClose,
  },
  {
    key: 'pos-daily-close',
    title: 'POS 日結待簽核',
    hint: '才藝 POS 有交易但尚未簽核的日結',
    unit: '日',
    to: '/activity/pos/approval',
    load: loadPosDailyClose,
  },
]

export function useOtherSignoffs() {
  const visible = DEFS.filter((def) => canAccessRoute(def.to))
  const counts = reactive<Record<string, SignoffCount>>(
    Object.fromEntries(visible.map((def) => [def.key, { status: 'loading' } as SignoffCount])),
  )
  const loading = ref(false)

  async function reload(): Promise<void> {
    loading.value = true
    for (const def of visible) counts[def.key] = { status: 'loading' }
    await Promise.all(
      visible.map(async (def) => {
        try {
          const loaded = await def.load()
          counts[def.key] = loaded
            ? { status: 'ok', count: loaded.count, detail: loaded.detail }
            : { status: 'none' }
        } catch {
          counts[def.key] = { status: 'error' }
        }
      }),
    )
    loading.value = false
  }

  const items = computed<OtherSignoffItem[]>(() =>
    visible.map((def) => ({
      key: def.key,
      title: def.title,
      hint: def.hint,
      unit: def.unit,
      to: def.to,
      count: counts[def.key] ?? { status: 'none' },
    })),
  )
  const hasError = computed(() => items.value.some((item) => item.count.status === 'error'))

  return { items, hasError, loading, reload }
}
