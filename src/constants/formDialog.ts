/**
 * Admin 表單 dialog 分型寬度（2026-08-18 admin 新增表單重整）
 *
 * 分型規則見 docs/analysis/2026-08-18-admin-create-form-inventory.md 與 DESIGN.md：
 * - compact（1–6 欄）：預設單欄，語意成對短欄位可雙欄
 * - standardNarrow / standard（7–14 欄）：label-position="top" ＋ .form-grid 語意兩欄
 * - wide（15+ 欄）：section nav ＋ 12-col grid；min() 保證 1024–1199 視窗不溢出
 *
 * 手機（--to-sm）由 src/assets/main.css 全域收成 95% 寬，元件不需另寫 RWD。
 */
export const FORM_DIALOG_WIDTH = {
  compact: '520px',
  standardNarrow: '760px',
  standard: '860px',
  wide: 'min(1040px, 94vw)',
} as const

export type FormDialogSize = keyof typeof FORM_DIALOG_WIDTH
