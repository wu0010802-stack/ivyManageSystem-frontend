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

/**
 * 目前這顆 access_token cookie 是誰（任何角色都可呼叫；後端 api/auth.py
 * `GET /auth/me` 只掛 get_current_user）。家長端拿它來說明「你現在是哪個
 * 員工身分」，屬附加資訊，失敗不影響提示本身。
 */
export const fetchStaffSessionIdentity = () => api.get('/auth/me')

/**
 * 清掉「非家長身分」的 access_token cookie。
 *
 * 不能用上面的 logout()：`/parent/auth/logout` 掛了 require_parent_role()，
 * 員工身分打它只會再吃一次 403、cookie 清不掉。只有管理端 logout 沒有角色
 * 守衛。代價是它會一併結束使用者在管理端的登入（bump token_version），
 * 所以 UI 必須先講清楚再讓使用者按。
 */
export const logoutStaffSession = () => api.post('/auth/logout')
