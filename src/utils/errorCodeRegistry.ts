/**
 * 家長端 error code → 顯示訊息 + next-step hint 註冊表。
 *
 * 與後端 `utils/error_codes.py` ErrorCode enum 對齊（手動同步；follow-up
 * codegen 可從 OpenAPI 抓 discriminator 自動產生）。
 *
 * 為何分離 message 與 nextStep：
 *   - message：直接告知發生什麼（取代原本後端 detail 字串）
 *   - nextStep：告訴 user 下一步該怎麼做（取代「請聯絡管理員」這種無資訊提示）
 *
 * level 決定 UI 樣式：error / warning / info（對應 el-alert type 與 toast 色）。
 */

export interface FriendlyError {
  message: string
  nextStep?: string
  level: 'error' | 'warning' | 'info'
}

export const ERROR_CODE_REGISTRY: Record<string, FriendlyError> = {
  // ===== 家長綁定流程 =====
  BIND_CODE_INVALID: {
    message: '綁定碼無效或已過期',
    nextStep: '請至 LINE 主選單重新取得綁定碼，或聯絡園所協助',
    level: 'warning',
  },
  BIND_CODE_EXPIRED: {
    message: '綁定碼已過期',
    nextStep: '請聯絡園所重新產生新的綁定碼',
    level: 'warning',
  },
  BIND_CODE_ALREADY_USED: {
    message: '此綁定碼已被使用',
    nextStep: '如非您本人操作請立即聯絡園所',
    level: 'warning',
  },
  // BE-C 補登：既有 auth.py _diagnose_binding_failure 已 in-use 的兩條 code
  BIND_CODE_NOT_FOUND: {
    message: '找不到此綁定碼',
    nextStep: '請確認輸入是否正確；如仍無法綁定請聯絡園所',
    level: 'warning',
  },
  BIND_CODE_USED: {
    message: '此綁定碼已被使用',
    nextStep: '如非您本人操作請立即聯絡園所',
    level: 'warning',
  },

  // ===== LIFF 認證 =====
  LINE_BINDING_EXPIRED: {
    message: '您的綁定已過期',
    nextStep: '請點選下方「重新綁定」，或聯絡園所重新發送邀請',
    level: 'warning',
  },
  LINE_BINDING_NOT_FOUND: {
    message: '找不到您的綁定資料',
    nextStep: '請聯絡園所建立綁定',
    level: 'error',
  },
  LINE_PROFILE_FETCH_FAILED: {
    message: '無法取得 LINE 個人資料',
    nextStep: '請稍後再試，或重新開啟 LIFF 頁面',
    level: 'warning',
  },

  // ===== 家長存取資源 =====
  STUDENT_NOT_FOUND: {
    message: '找不到對應的學生資料',
    nextStep: '請確認綁定的學生仍在學；如有疑問請聯絡園所',
    level: 'error',
  },
  STUDENT_NOT_LINKED_TO_PARENT: {
    message: '您無權存取此學生資料',
    nextStep: '請聯絡園所確認綁定關係',
    level: 'error',
  },
  PORTAL_DATA_UNAVAILABLE: {
    message: '資料暫時無法存取',
    nextStep: '請稍後再試；持續發生請聯絡園所',
    level: 'warning',
  },
  CONTACT_BOOK_NOT_PUBLISHED: {
    message: '今日聯絡簿尚未發布',
    nextStep: '老師通常於下午 5 點前發布；若有疑問請聯絡老師',
    level: 'info',
  },

  // ===== 家長端通用（同意 / DSR / 授權）=====
  CONSENT_REQUIRED: {
    message: '請先完成同意聲明',
    nextStep: '點選下方「我同意」按鈕後即可使用',
    level: 'info',
  },
  DSR_REQUEST_INVALID: {
    message: '個資請求格式有誤',
    nextStep: '請重新填寫表單；若仍失敗請聯絡園所',
    level: 'warning',
  },
  PARENT_NOT_AUTHORIZED: {
    message: '您目前沒有此操作的權限',
    nextStep: '請聯絡園所確認帳號權限',
    level: 'error',
  },
}
