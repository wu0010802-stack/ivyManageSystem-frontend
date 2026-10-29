/**
 * 密碼規則（前端提示用，後端 `utils/auth.validate_password_strength` 為最終權威）。
 *
 * 規則逐條對齊後端：至少 8 字元、至少 1 大寫、1 小寫、1 數字。
 * 後端另有「不可重複使用最近 5 個密碼」與「外洩名單比對」兩條，前端無法預先判斷，
 * 只在 PASSWORD_SERVER_ONLY_HINT 以文字告知，不做任何前端擋關（不自行加嚴或放寬）。
 */
export const PASSWORD_RULE_CHECKS: ReadonlyArray<{ label: string; test: (password: string) => boolean }> = [
  { label: '至少 8 個字元', test: (p) => p.length >= 8 },
  { label: '至少包含 1 個大寫英文字母', test: (p) => /[A-Z]/.test(p) },
  { label: '至少包含 1 個小寫英文字母', test: (p) => /[a-z]/.test(p) },
  { label: '至少包含 1 個數字', test: (p) => /\d/.test(p) },
]

export const PASSWORD_RULES: string[] = PASSWORD_RULE_CHECKS.map((rule) => rule.label)

/** 後端才驗得出來的規則（前端不擋、只提醒），避免使用者送出後才被「重複使用／外洩」訊息嚇到。 */
export const PASSWORD_SERVER_ONLY_HINT = '系統另會拒絕最近用過的 5 個密碼，以及已出現在外洩名單的密碼。'

/** 逐條回報目前輸入是否符合各規則（供即時清單渲染）。 */
export function evaluatePasswordRules(password: string): Array<{ label: string; ok: boolean }> {
  return PASSWORD_RULE_CHECKS.map((rule) => ({ label: rule.label, ok: rule.test(password) }))
}

export const validatePasswordStrength = (_: unknown, value: unknown, callback: (err?: Error) => void) => {
  const password = (value as string) || ''
  if (!password) {
    callback(new Error('請輸入新密碼'))
    return
  }
  if (password.length < 8) {
    callback(new Error('密碼至少 8 個字元'))
    return
  }
  if (!/[A-Z]/.test(password)) {
    callback(new Error('密碼需包含至少 1 個大寫英文字母'))
    return
  }
  if (!/[a-z]/.test(password)) {
    callback(new Error('密碼需包含至少 1 個小寫英文字母'))
    return
  }
  if (!/\d/.test(password)) {
    callback(new Error('密碼需包含至少 1 個數字'))
    return
  }
  callback()
}
