import axios from 'axios'
import { getToken, setToken, setUserInfo, clearAuth } from '@/utils/auth'

const api = axios.create({
    baseURL: '/api',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Inject JWT token
api.interceptors.request.use(
    config => {
        const token = getToken()
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`
        }
        return config
    },
    error => Promise.reject(error)
)

// ---------- Token refresh logic ----------
let _refreshing = null // 單一 refresh promise，避免併發多次刷新

function _doRefresh() {
    const token = getToken()
    if (!token) return Promise.reject(new Error('no token'))

    return axios.post('/api/auth/refresh', null, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
    }).then(res => {
        const { token: newToken, user } = res.data
        setToken(newToken)
        if (user) setUserInfo(user)
        return newToken
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
                const newToken = await _refreshing

                // 用新 token 重試原本的請求
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`
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

// Employee Switcher
api.impersonate = (employeeId) => {
    return api.post('/auth/impersonate', { employee_id: employeeId })
}

export default api
