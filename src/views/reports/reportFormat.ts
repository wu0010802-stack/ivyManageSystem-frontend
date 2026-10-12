/**
 * 報表模組共用的數字／月份格式（2026-10-12 報表改版）。
 *
 * 規則（全模組一致，見改版提案 F9）：
 * - 表格與大數字：無幣別前綴、千分位（頁首已註明「現金收付實現制」，幣別只講一次）
 * - 圖表座標軸：以「萬」為單位（在地讀法；取代 NT$2000k）
 * - tooltip 與單筆金額仍可用 `@/utils/format` 的 money()（NT$ 前綴）
 */

const amountFmt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })

/** 1965811 → "1,965,811"；null/undefined/NaN → ""。 */
export function formatAmount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  return amountFmt.format(Math.round(v))
}

/** 帶正負號的金額差：+174,550 / −23,000 / 0。 */
export function formatSignedAmount(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0'
  return `${v > 0 ? '+' : '−'}${formatAmount(Math.abs(v))}`
}

/** 座標軸刻度：0 → "0"、500000 → "50 萬"、5000 → "0.5 萬"、-250000 → "-25 萬"。 */
export function formatWan(v: number | string): string {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return '0'
  const wan = n / 10000
  const abs = Math.abs(wan)
  const digits = abs >= 100 ? 0 : abs >= 1 ? 1 : 2
  let text = wan.toFixed(digits)
  // 只去掉小數點後的尾 0（200 不能變 2）
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '')
  return `${text} 萬`
}

/**
 * 月份清單壓成區間文字：[1,2,3,5,7,8] → "1–3、5、7–8 月"；空陣列 → ""。
 * 輸入不必排序、可重複。
 */
export function monthRangeText(months: number[]): string {
  const sorted = [...new Set(months)].filter(m => m >= 1 && m <= 12).sort((a, b) => a - b)
  if (!sorted.length) return ''
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const m = sorted[i]
    if (m === prev + 1) { prev = m; continue }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = m
    prev = m
  }
  return `${parts.join('、')} 月`
}

/** 付款方式代碼 → 中文（下鑽明細全來源共用；未知值原樣顯示，已是中文者亦原樣）。 */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '現金',
  bank_transfer: '銀行匯款',
  transfer: '轉帳',
  check: '支票',
  linepay: 'LINE Pay',
  other: '其他',
}

export function methodLabel(m: string | null | undefined): string {
  if (!m) return ''
  return PAYMENT_METHOD_LABEL[m] ?? m
}
