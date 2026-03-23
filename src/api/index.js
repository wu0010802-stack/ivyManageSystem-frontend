import axios from 'axios'
import { setUserInfo, clearAuth } from '@/utils/auth'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: 10000,
    withCredentials: true, // 自動攜帶 httpOnly Cookie
    headers: {
        'Content-Type': 'application/json'
    }
})

// 不再需要 request interceptor 注入 Authorization header
// Token 改由瀏覽器自動攜帶 httpOnly Cookie

// ---------- Token refresh logic ----------
let _refreshing = null // 單一 refresh promise，避免併發多次刷新

function _doRefresh() {
    // Cookie 會自動帶出，不需手動設定 header
    return axios.post('/api/auth/refresh', null, {
        withCredentials: true,
        timeout: 10000,
    }).then(res => {
        // 後端已透過 Set-Cookie 更新 access_token，前端只需更新 userInfo
        const { user } = res.data
        if (user) setUserInfo(user)
        return true
    })
}

// Handle errors + 401 auto-refresh + redirect
api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config

        // 只對 401 且非登入/refresh 請求嘗試刷新
        const isAuthEndpoint = originalRequest?.url?.includes('/auth/login')
            || originalRequest?.url?.includes('/auth/refresh')

        if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest._retried) {
            originalRequest._retried = true

            try {
                // 併發請求共用同一個 refresh promise
                if (!_refreshing) {
                    _refreshing = _doRefresh().finally(() => { _refreshing = null })
                }
                await _refreshing

                // 用新 Cookie 重試原本的請求（Cookie 自動帶出，不需手動設定 header）
                return api(originalRequest)
            } catch {
                // Refresh 也失敗，清除登入狀態並導向登入頁
                _redirectToLogin()
                return Promise.reject(error)
            }
        }

        // 非 401 或已重試過仍失敗
        if (error.response?.status === 401 && !isAuthEndpoint) {
            _redirectToLogin()
        }

        // 正規化 UI 顯示用錯誤訊息，避免各元件重複解析 response 結構
        error.displayMessage = error.response?.data?.detail
            || error.response?.data?.message
            || null

        return Promise.reject(error)
    }
)

function _redirectToLogin() {
    const isPortal = window.location.hash.includes('/portal')
    clearAuth()
    if (isPortal) {
        window.location.hash = '#/portal/login'
    } else {
        window.location.hash = '#/login'
    }
}

export default api
