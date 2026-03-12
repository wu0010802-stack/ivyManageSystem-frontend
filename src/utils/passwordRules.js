export const PASSWORD_RULES = [
  '至少 8 個字元',
  '至少包含 1 個大寫英文字母',
  '至少包含 1 個小寫英文字母',
  '至少包含 1 個數字',
]

export const validatePasswordStrength = (_, value, callback) => {
  const password = value || ''
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
