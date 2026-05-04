/**
 * 家長 App 專用 axios instance
 *
 * 與管理端 src/api/index.js 分離：401 redirect 邏輯不同（家長要回到 LIFF 登入頁
 * 而非管理端 /login）。Cookie httpOnly 由瀏覽器自動攜帶，路徑 /api 共用。
 */

import axios from 'axios'
import { applyDedupe } from '@/utils/apiDedupe'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  // 30s：手機端網路較慢；在 nginx upstream timeout（60s）前先 abort 即可。
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

applyDedupe(api)

const TIMING_BUFFER_KEY = 'parent_api_timings'
const TIMING_BUFFER_MAX = 50

api.interceptors.request.use((config) => {
  config.metadata = { startedAt: performance.now() }
  return config
})

function _recordTiming(method, url, status, durationMs) {
  if (import.meta.env.DEV) {
    const tag = status >= 400 ? '✗' : '✓'
    console.debug(
      `[parent-api] ${tag} ${method} ${url} → ${status} ${durationMs.toFixed(0)}ms`,
    )
  }
  try {
    const raw = sessionStorage.getItem(TIMING_BUFFER_KEY)
    const buf = raw ? JSON.parse(raw) : []
    buf.push({
      m: method,
      u: url,
      s: status,
      d: Math.round(durationMs),
      t: Date.now(),
    })
    if (buf.length > TIMING_BUFFER_MAX) buf.splice(0, buf.length - TIMING_BUFFER_MAX)
    sessionStorage.setItem(TIMING_BUFFER_KEY, JSON.stringify(buf))
  } catch {
    /* sessionStorage 滿/不可用 — 安靜失敗 */
  }
}

let _refreshing = null

function _doRefresh() {
  return axios
    .post('/api/parent/auth/refresh', null, { withCredentials: true, timeout: 30000 })
    .then(() => true)
}

api.interceptors.response.use(
  (response) => {
    const startedAt = response.config?.metadata?.startedAt
    if (startedAt != null) {
      _recordTiming(
        (response.config.method || 'get').toUpperCase(),
        response.config.url || '',
        response.status,
        performance.now() - startedAt,
      )
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config
    const url = originalRequest?.url || ''
    const isAuthEndpoint =
      url.includes('/parent/auth/liff-login') ||
      url.includes('/parent/auth/bind') ||
      url.includes('/parent/auth/refresh')

    const startedAt = originalRequest?.metadata?.startedAt
    if (startedAt != null) {
      _recordTiming(
        (originalRequest.method || 'get').toUpperCase(),
        url,
        error.response?.status ?? 0,
        performance.now() - startedAt,
      )
    }

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
      } catch (refreshErr) {
        // refresh 自己回 409 RACE：兄弟請求已完成 rotation 並寫入新 cookie，
        // 此分支直接重打原請求即可恢復；不重導登入
        if (refreshErr?.response?.status === 409) {
          return api(originalRequest)
        }
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
