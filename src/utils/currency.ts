/**
 * 全站金額格式化的單一來源（single source of truth）。
 *
 * 格式：`NT$1,234`（千分位、無空格、新台幣明確前綴）。
 * null / undefined / 空字串 / 非數字 → `—`（em dash）。
 *
 * 自 2026-05-29 currency 統一起，`utils/format.money` 與 `constants/pos.formatTWD`
 * 皆委派至此，確保全站金額顯示一致（會計核對用）。新顯示金額一律用本 helper，
 * 不要再各自 `toLocaleString` 或拼 `$`/`元`。
 */
const EMPTY = '—'

// module 級單例：財務大表每 render 會呼叫數百次，避免每次重建 Intl 物件。
// 等價於 Number(val).toLocaleString('zh-Hant')（相同 locale、無 options → 預設值）。
const _twd = new Intl.NumberFormat('zh-Hant')

export function formatCurrency(val: unknown): string {
  if (val == null || val === '' || Number.isNaN(Number(val))) return EMPTY
  return 'NT$' + _twd.format(Number(val))
}

/**
 * 顯示層專用：金額先四捨五入到整數元，再走 `formatCurrency`（NT$ 千分位）。
 *
 * 用於彙總大表等「畫面顯示」場景（金額欄與整數欄並列時，小數點易造成欄寬不足
 * 而換行，稽核核對時視覺突兀）；**不可**用於送出/核對用的原始精度資料——呼叫端
 * 仍應保留 Decimal 序列化字串原值，只在顯示時套用本函式（原始資料不因顯示層
 * 四捨五入而改變）。
 *
 * null / '' 直接交給 `formatCurrency` 既有「—」fallback（`Number(null) === 0`／
 * `Number('') === 0` 會誤判成有效值，故先排除，不進 `Math.round`）。
 */
export function moneyInt(val: unknown): string {
  if (val == null || val === '') return formatCurrency(val)
  const n = Number(val)
  return Number.isFinite(n) ? formatCurrency(Math.round(n)) : formatCurrency(val)
}
