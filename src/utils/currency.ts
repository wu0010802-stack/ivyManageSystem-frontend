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

export function formatCurrency(val: unknown): string {
  if (val == null || val === '' || Number.isNaN(Number(val))) return EMPTY
  return 'NT$' + Number(val).toLocaleString('zh-Hant')
}
