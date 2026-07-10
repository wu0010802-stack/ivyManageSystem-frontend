/**
 * 考核模組中文標籤集中（i18n 過渡層）
 *
 * 此檔將原本散落在 12+ 個 .vue 檔的硬編碼中文集中，
 * 為未來導入 vue-i18n / vue3-i18n 做準備。
 *
 * 命名規約：
 *   STATUS_LABEL    → AppraisalSummary.status 中文
 *   STAGE_LABEL     → BatchSignButton stage（SUPERVISOR/ACCOUNTING/FINALIZE）
 *   ACTION_LABEL    → AppraisalSummaryLog.action 中文
 *   REJECT_TARGET_LABEL → 退簽目標 status 中文
 *   MSG.*           → 通用 ElMessage / placeholder 字串
 */

// AppraisalSummary.status enum → 中文
export const STATUS_LABEL = {
  DRAFT: '草稿',
  SUPERVISOR_SIGNED: '主管已簽',
  ACCOUNTING_SIGNED: '會計已簽',
  FINALIZED: '已核定',
}

// 退簽目標 status 中文（與 STATUS_LABEL 等價，但保留可獨立調整）
export const REJECT_TARGET_LABEL = {
  DRAFT: '退到 草稿',
  SUPERVISOR_SIGNED: '退到 主管已簽',
  ACCOUNTING_SIGNED: '退到 會計已簽',
}

// BatchSignButton stage 中文（注意：簽核 vs 已簽是不同 surface）
export const STAGE_LABEL = {
  SUPERVISOR: '主管簽',
  ACCOUNTING: '會計簽',
  FINALIZE: '核定',
}

// AppraisalSummaryLog.action 中文
export const ACTION_LABEL = {
  SIGN_SUPERVISOR: '主管簽核',
  SIGN_ACCOUNTING: '會計簽核',
  FINALIZE: '核定',
  REJECT: '退簽',
  COMMENT: '留言',
  RECOMPUTE: '重算',
}

// 通用訊息字串（ElMessage / placeholder）
export const MSG = {
  recompute_success: '重算完成',
  recompute_failed: '重算失敗',
  sign_success: '簽核完成',
  sign_failed: '簽核失敗',
  reject_success: '退簽成功',
  reject_failed: '退簽失敗',
  reject_target_required: '請選擇退簽目標',
  reject_reason_placeholder: '請填寫退簽原因',
  reject_confirm_btn: '確認退簽',
  comment_success: '已留言',
  comment_failed: '留言失敗',
  comment_required: '留言不可空',
  comment_placeholder: '留言內容',
  load_failed: '載入失敗',
  recompute_btn: '重算 Summary',
}

// 工具函式 — null/unknown key 回傳 raw code，UI 仍可顯示
export function statusLabel(s: string) {
  return (STATUS_LABEL as Record<string, string>)[s] || s
}

export function actionLabel(a: string) {
  return (ACTION_LABEL as Record<string, string>)[a] || a
}

export type AyeTagType = 'success' | 'warning' | 'info' | 'primary' | 'danger'

// ── 週期狀態（考核 AppraisalCycle 與年終 YearEndCycle 共用 OPEN/LOCKED/CLOSED）──
// 取代原 CycleListView / YearEndListView / ExceptionCenterView 三處各自定義
export const CYCLE_STATUS_LABEL: Record<string, string> = {
  OPEN: '開放',
  LOCKED: '已鎖定',
  CLOSED: '已封存',
}
export const CYCLE_STATUS_TAG: Record<string, AyeTagType> = {
  OPEN: 'success',
  LOCKED: 'warning',
  CLOSED: 'info',
}

// ── 簽核狀態 tag 顏色（採 YearEndGridView 既有配色為準；STATUS_LABEL 為文案來源）──
export const SIGN_STATUS_LABEL = STATUS_LABEL
export const SIGN_STATUS_TAG: Record<string, AyeTagType> = {
  DRAFT: 'info',
  SUPERVISOR_SIGNED: 'warning',
  ACCOUNTING_SIGNED: 'primary',
  FINALIZED: 'success',
}
export const SIGN_STATUS_ORDER = ['DRAFT', 'SUPERVISOR_SIGNED', 'ACCOUNTING_SIGNED', 'FINALIZED'] as const

// ── 等第（詞彙沿用原 ListView.gradeLabel）──
export const GRADE_LABEL: Record<string, string> = {
  OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等',
}
export const GRADE_TAG: Record<string, AyeTagType> = {
  OUTSTANDING: 'success', GOOD: 'primary', PASS: 'info', WARN: 'warning', FAIL: 'danger',
}

// ── 例外類型（對齊後端 services/{appraisal,year_end}/exceptions.py 的 type 值）──
export const EXCEPTION_TYPE_LABEL: Record<string, string> = {
  hire_in_window_missing_employment_period: '任職區間缺漏',
  manual_items_missing: '手填事件缺漏',
  summaries_not_finalized: '考核尚未核定',
  qualification: '年資資格疑義',
  missing_class_target: '班級編制缺漏',
  missing_head_teacher: '班導未指定',
  unassigned_course: '課程未指派老師',
  unmatched_registrations: '報名未配對',
  prereq_not_finalized: '前置未核定',
  performance_anomaly: '班級績效異常',
}

export function cycleStatusLabel(s: string) { return CYCLE_STATUS_LABEL[s] || s }
export function signStatusLabel(s: string) { return statusLabel(s) }
export function gradeLabel(g: string) { return GRADE_LABEL[g] || g }
export function exceptionTypeLabel(t: string) { return EXCEPTION_TYPE_LABEL[t] || t }
