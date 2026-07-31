import api from './index'

export const liffLogin = (idToken: string) =>
  api.post('/parent/auth/liff-login', { id_token: idToken })

export const bind = (code: string) =>
  api.post('/parent/auth/bind', { code })

export const bindAdditional = (code: string) =>
  api.post('/parent/auth/bind-additional', { code })

// 無 LINE 家長 / 換新裝置：以 staff 簽發的設定碼直接兌換登入 session
// （passwordless）。成功回傳 shape 與 liffLogin/bind 的 ok 分支一致
// （{status:'ok', user:{user_id,name,role}}），呼叫端沿用同一套後續流程
// （consent gate + resolveSafeRedirect），不要另外分岔。
export const deviceSetup = (code: string) =>
  api.post('/parent/auth/device-setup', { code })

export const logout = () => api.post('/parent/auth/logout')
