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
 */
export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}
