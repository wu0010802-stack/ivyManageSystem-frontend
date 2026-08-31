/**
 * 收支彙總 / 概況共用的 MoM／YoY 計算 helper。
 *
 * 抽出獨立檔案避免 OverviewPanel.vue 與 FinanceSummaryPanel.vue 各自維護一份
 * 同型邏輯漂移（2026-07-05 報表重構）。
 */

export interface FinanceTrendRow {
  month: number
  revenue: number
  refund: number
  expense: number
  net: number
}

/**
 * 找出所選年度內「最後一個有資料的月份」，作為 MoM 比較的錨點。
 *
 * 後端 `monthly_trend` 固定回傳 12 筆（無資料的月份數值皆為 0），並非稀疏陣列，
 * 不能用陣列長度判斷「有沒有到那個月」；改用「該月四項欄位是否全為 0」判斷。
 *
 * 修正舊版錨定 `new Date().getMonth()+1`（瀏覽器當下真實月份）的 bug：瀏覽非當年
 * （過去/未來年度）時，「vs 上月」會比較跟「現在」脫鉤的月份，容易被誤讀成最新趨勢
 * （2026-07-05 稽核 P3-2）。
 */
export function lastMonthWithData(trend: FinanceTrendRow[]): number | null {
  for (let i = trend.length - 1; i >= 0; i--) {
    const r = trend[i]
    if (
      (r.revenue || 0) !== 0 ||
      (r.refund || 0) !== 0 ||
      (r.expense || 0) !== 0 ||
      (r.net || 0) !== 0
    ) {
      return r.month
    }
  }
  return null
}

/**
 * 百分比變化。分母為 0（含「無資料」情況）時回傳 null，UI 應顯示替代文案
 * （如「無去年資料」），而非誤導性的 -100% / Infinity。
 *
 * 分母取絕對值（2026-08-25 稽核 C1）：基期為負（如淨現金虧損月）時，正負號
 * 必須跟隨 curr - prev 的方向（虧損擴大=負/down、虧損收斂=正/up）；帶號分母
 * 會把「更負」算成正百分比，UI 因而顯示綠色「改善」，與事實相反。
 */
export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

export interface TrendSums { revenue: number; refund: number; expense: number; net: number }

/**
 * 「截至實際發生」口徑：只加總 month ≤ uptoMonth 的列。
 * KPI 主數字用此結果，取代後端 summary 的全年（含未來月預登錄固定支出）口徑。
 */
export function sumTrendUpTo(trend: FinanceTrendRow[], uptoMonth: number): TrendSums {
  const out: TrendSums = { revenue: 0, refund: 0, expense: 0, net: 0 }
  for (const r of trend) {
    if (r.month > uptoMonth) continue
    out.revenue += r.revenue || 0
    out.refund += r.refund || 0
    out.expense += r.expense || 0
    out.net += r.net || 0
  }
  return out
}

/** afterMonth 之後仍有 expense（= 預登錄固定支出）的月份與總額，供口徑副行/表尾說明。 */
export function futurePreloggedExpense(
  trend: FinanceTrendRow[],
  afterMonth: number,
): { total: number; months: number[] } {
  const months: number[] = []
  let total = 0
  for (const r of trend) {
    if (r.month <= afterMonth) continue
    if ((r.expense || 0) > 0) {
      months.push(r.month)
      total += r.expense
    }
  }
  months.sort((a, b) => a - b)
  return { total, months }
}

/**
 * 圖表 series 截斷：固定回傳 12 格，month > cutoffMonth 塞 null（chart.js 不畫），
 * 消除「未來月掉到 0」的資料懸崖；≤ cutoff 的真實 0 照畫。
 */
export function cutSeries(
  trend: FinanceTrendRow[],
  key: 'revenue' | 'refund' | 'expense' | 'net',
  cutoffMonth: number,
): (number | null)[] {
  const byMonth: Record<number, FinanceTrendRow> = {}
  trend.forEach(r => { byMonth[r.month] = r })
  const out: (number | null)[] = []
  for (let m = 1; m <= 12; m++) {
    if (m > cutoffMonth || !byMonth[m]) {
      out.push(null)
    } else {
      out.push(byMonth[m][key])
    }
  }
  return out
}

export type DeltaKind = 'up' | 'down' | 'flat'

/** MoM/YoY 顯示語意：null=無資料不顯示；|v|<0.1% 視為持平（灰、無箭頭）。 */
export function deltaKind(v: number | null): DeltaKind | null {
  if (v == null || !Number.isFinite(v)) return null
  if (Math.abs(v) < 0.1) return 'flat'
  return v > 0 ? 'up' : 'down'
}
