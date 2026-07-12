/**
 * 台灣手機號碼正規化 + 格式驗證（F4 拆分時發現：usePublicRegistrationForm.ts 與
 * ActivityPublicQueryView.vue 各自維護一份同款 regex/normalize，此檔為單一事實
 * 來源，兩處改為引用，避免日後修規則漏改一邊）。
 */
export const TW_MOBILE_RE = /^09\d{8}$/

export function normalizeMobile(raw: unknown): string {
  return String(raw || '').replace(/[\s\-().]/g, '')
}
