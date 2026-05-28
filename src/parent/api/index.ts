/**
 * 家長 App 專用 axios instance
 *
 * 與管理端 src/api/index.js 分離：401 redirect 邏輯不同（家長要回到 LIFF 登入頁
 * 而非管理端 /login）。Cookie httpOnly 由瀏覽器自動攜帶，路徑 /api 共用。
 */

import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { applyDedupe } from '@/utils/apiDedupe'
import { classifyError, DEFAULT_MESSAGES } from '@/utils/errorHandler'
import parentRouter from '@/parent/router'
import { toast } from '@/parent/utils/toast'

declare module 'axios' {
  interface AxiosError {
    displayMessage?: string | null
    // 後端 BusinessError envelope 的完整 detail：{ code, message, request_id, ...extra }
    // 與 admin src/api/index.ts 一致用 unknown，元件以 type guard 或 cast 取 code
    errorDetail?: unknown
  }
  interface InternalAxiosRequestConfig {
    metadata?: { startedAt: number }
    _retried?: boolean
  }
}

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  // 30s：手機端網路較慢；在 nginx upstream timeout（60s）前先 abort 即可。
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

applyDedupe(api)

const TIMING_BUFFER_KEY = 'parent_api_timings'
const TIMING_BUFFER_MAX = 50

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.metadata = { startedAt: performance.now() }
  return config
})

function _recordTiming(method: string, url: string, status: number, durationMs: number) {
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

let _refreshing: Promise<boolean> | null = null

function _doRefresh(): Promise<boolean> {
  // 回傳 boolean (true=成功)；rotation 5s race 視窗內同 family 第二次 refresh 會回 409，
  // 等同「已被同 family 完成 rotation」→ 仍視為成功（後續重打原請求會帶到新 cookie）。
  return axios
    .post('/api/parent/auth/refresh', null, { withCredentials: true, timeout: 30000 })
    .then(() => true)
    .catch((err) => {
      if (err?.response?.status === 409) return true
      throw err
    })
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
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const url = originalRequest?.url || ''
    const isAuthEndpoint =
      url.includes('/parent/auth/liff-login') ||
      url.includes('/parent/auth/bind') ||
      url.includes('/parent/auth/refresh')

    const startedAt = originalRequest?.metadata?.startedAt
    if (startedAt != null) {
      _recordTiming(
        (originalRequest?.method || 'get').toUpperCase(),
        url,
        error.response?.status ?? 0,
        performance.now() - startedAt,
      )
    }

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      !originalRequest?._retried
    ) {
      if (originalRequest) originalRequest._retried = true
      try {
        if (!_refreshing) {
          _refreshing = _doRefresh().finally(() => {
            _refreshing = null
          })
        }
        await _refreshing
        // 不論 refresh 是本請求發起或共享自其他並發請求，都要重打原請求；
        // 重打若仍 401 才落到下方的 _redirectToLogin。
        return api(originalRequest!)
      } catch (refreshErr) {
        // refresh 真的失敗（過期 / 撤銷）才導去登入
        _redirectToLogin()
        return Promise.reject(refreshErr)
      }
    }

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      originalRequest?._retried
    ) {
      // 重打仍 401 才導去登入；先前邏輯會在第三、四個並發請求拿不到 refresh
      // share 而誤登出，這裡僅針對「真正重試後仍失敗」的請求觸發。
      _redirectToLogin()
    }

    // Phase 4 kill switch（spec §4.4）：
    // 503 + envelope code === 'MAINTENANCE_MODE' → parentRouter.replace(/maintenance)
    // 503 + 'READ_ONLY_MODE' → toast.warn（家長端不拉 element-plus）
    // 都立即 reject，不進 displayMessage normalization
    const ksDetail = error.response?.data as { detail?: unknown } | undefined
    const ksRaw = ksDetail?.detail
    if (error.response?.status === 503 && ksRaw && typeof ksRaw === 'object') {
      const ksObj = ksRaw as { code?: unknown; message?: unknown }
      if (ksObj.code === 'MAINTENANCE_MODE') {
        if (parentRouter.currentRoute.value.path !== '/maintenance') {
          parentRouter.replace({
            path: '/maintenance',
            query: { message: typeof ksObj.message === 'string' ? ksObj.message : undefined },
          })
        }
        error.displayMessage = typeof ksObj.message === 'string' ? ksObj.message : '系統維護中，請稍後再回來'
        error.errorDetail = ksObj
        return Promise.reject(error)
      }
      if (ksObj.code === 'READ_ONLY_MODE') {
        toast.warn(typeof ksObj.message === 'string' ? ksObj.message : '系統暫時唯讀，編輯功能暫不可用')
        error.displayMessage = typeof ksObj.message === 'string' ? ksObj.message : '系統暫時唯讀，編輯功能暫不可用'
        error.errorDetail = ksObj
        return Promise.reject(error)
      }
    }

    // 正規化錯誤訊息：對齊 admin (src/api/index.ts) 對 BusinessError envelope 的處理
    // 後端兩種 shape：
    //   1) HTTPException：{ detail: "字串" }
    //   2) BusinessError envelope：{ detail: { code, message, request_id, ...extra } }
    // 後者若直接 String(data?.detail) 會變 "[object Object]"，因此須拆 detail.message。
    //
    // Phase 5 friendly-error（spec §5.1）：
    // 對 5xx / network / timeout 等無 detail 場景，fallback 到 DEFAULT_MESSAGES[errorType]
    // 取代原本顯示 axios 預設 "Request failed with status code 500"。
    const data = error.response?.data as { detail?: unknown; message?: string } | undefined
    const rawDetail = data?.detail
    const friendlyFallback = DEFAULT_MESSAGES[classifyError(error)] ?? null
    if (rawDetail && typeof rawDetail === 'object' && (rawDetail as Record<string, unknown>).message) {
      const obj = rawDetail as Record<string, unknown>
      error.displayMessage = (obj.message as string) || friendlyFallback
      error.errorDetail = obj
    } else {
      error.displayMessage = (rawDetail as string | null | undefined) || data?.message || friendlyFallback
      error.errorDetail = null
    }
    return Promise.reject(error)
  },
)

function _redirectToLogin() {
  if (window.location.hash !== '#/login' && !window.location.hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
}

export default api
