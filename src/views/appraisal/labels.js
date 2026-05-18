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
export function statusLabel(s) {
  return STATUS_LABEL[s] || s
}

export function actionLabel(a) {
  return ACTION_LABEL[a] || a
}
