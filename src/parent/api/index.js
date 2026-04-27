/**
 * 家長 App 專用 axios instance
 *
 * 與管理端 src/api/index.js 分離：401 redirect 邏輯不同（家長要回到 LIFF 登入頁
 * 而非管理端 /login）。Cookie httpOnly 由瀏覽器自動攜帶，路徑 /api 共用。
 */

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let _refreshing = null

function _doRefresh() {
  return axios
    .post('/api/auth/refresh', null, { withCredentials: true, timeout: 10000 })
    .then(() => true)
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const url = originalRequest?.url || ''
    const isAuthEndpoint =
      url.includes('/parent/auth/liff-login') ||
      url.includes('/parent/auth/bind') ||
      url.includes('/auth/refresh')

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      !originalRequest._retried
    ) {
      originalRequest._retried = true
      try {
        if (!_refreshing) {
          _refreshing = _doRefresh().finally(() => {
            _refreshing = null
          })
        }
        await _refreshing
        return api(originalRequest)
      } catch {
        _redirectToLogin()
        return Promise.reject(error)
      }
    }

    if (error.response?.status === 401 && !isAuthEndpoint) {
      _redirectToLogin()
    }

    error.displayMessage =
      error.response?.data?.detail || error.response?.data?.message || null
    return Promise.reject(error)
  },
)

function _redirectToLogin() {
  if (window.location.hash !== '#/login' && !window.location.hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
}

export default api
