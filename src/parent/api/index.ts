/**
 * 家長 App 專用 axios instance
 *
 * 與管理端 src/api/index.js 分離：401 redirect 邏輯不同（家長要回到 LIFF 登入頁
 * 而非管理端 /login）。Cookie httpOnly 由瀏覽器自動攜帶，路徑 /api 共用。
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type GenericAbortSignal,
  type InternalAxiosRequestConfig,
} from 'axios'
import { applyDedupe, clearDedupe } from '@/utils/apiDedupe'
import { classifyError, DEFAULT_MESSAGES } from '@/utils/errorHandler'
import { captureException as sentryCapture, sanitizeUrl } from '@/utils/sentry'
import { toast } from '@/parent/utils/toast'
import { useConsentGate } from '@/parent/composables/useConsentGate'

// Lazy router import：避免將 createRouter side effect 灌進所有 partial-mock
// vue-router 的既有測試（同 src/api/index.ts 處理方式）。
type ParentRouterShape = {
  replace: (to: { path: string; query?: Record<string, string | undefined> }) => unknown
  currentRoute: { value: { path: string; fullPath: string } }
}
let _parentRouterPromise: Promise<ParentRouterShape> | null = null
async function getParentRouter(): Promise<ParentRouterShape> {
  if (!_parentRouterPromise) {
    _parentRouterPromise = import('@/parent/router').then((m) => m.default as ParentRouterShape)
  }
  return _parentRouterPromise
}

declare module 'axios' {
  interface AxiosError {
    displayMessage?: string | null
    // 後端 BusinessError envelope 的完整 detail：{ code, message, request_id, ...extra }
    // 與 admin src/api/index.ts 一致用 unknown，元件以 type guard 或 cast 取 code
    errorDetail?: unknown
  }
  interface InternalAxiosRequestConfig {
    metadata?: { startedAt: number; sessionGeneration: number }
    _retried?: boolean
  }
}

export const PARENT_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export function buildParentRefreshUrl(base: string = PARENT_API_BASE): string {
  return `${base}/parent/auth/refresh`
}

const api: AxiosInstance = axios.create({
  baseURL: PARENT_API_BASE,
  // 30s：手機端網路較慢；在 nginx upstream timeout（60s）前先 abort 即可。
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

applyDedupe(api)

const TIMING_BUFFER_KEY = 'parent_api_timings'
const TIMING_BUFFER_MAX = 50
let _refreshing: Promise<boolean> | null = null
let _refreshController: AbortController | null = null
let _apiSessionGeneration = 0
let _apiSessionController = new AbortController()

function combineAbortSignals(
  existing: GenericAbortSignal | undefined,
  session: AbortSignal,
): AbortSignal {
  if (!existing) return session
  if (existing.aborted || session.aborted) {
    const aborted = new AbortController()
    aborted.abort()
    return aborted.signal
  }
  const combined = new AbortController()
  const abort = () => combined.abort()
  existing.addEventListener?.('abort', abort, { once: true })
  session.addEventListener('abort', abort, { once: true })
  return combined.signal
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.metadata = {
    startedAt: performance.now(),
    sessionGeneration: _apiSessionGeneration,
  }
  config.signal = combineAbortSignals(config.signal, _apiSessionController.signal)
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

function _doRefresh(): Promise<boolean> {
  // 回傳 boolean (true=成功)；rotation 5s race 視窗內同 family 第二次 refresh 會回 409，
  // 等同「已被同 family 完成 rotation」→ 仍視為成功（後續重打原請求會帶到新 cookie）。
  const controller = new AbortController()
  const generation = _apiSessionGeneration
  _refreshController = controller
  return axios
    .post(buildParentRefreshUrl(), null, {
      withCredentials: true,
      timeout: 30000,
      signal: combineAbortSignals(controller.signal, _apiSessionController.signal),
    })
    .then(() => {
      if (generation !== _apiSessionGeneration) {
        throw new axios.CanceledError('Parent session changed during refresh')
      }
      return true
    })
    .catch((err) => {
      if (err?.response?.status === 409) return true
      throw err
    })
    .finally(() => {
      if (_refreshController === controller) _refreshController = null
    })
}

/** 登出時中止 refresh、清 dedupe 與可能含路徑 id 的 timing buffer。 */
export function resetParentApiSessionState(): void {
  _apiSessionGeneration += 1
  _apiSessionController.abort()
  _apiSessionController = new AbortController()
  _refreshController?.abort()
  _refreshController = null
  _refreshing = null
  clearDedupe(api)
  try {
    sessionStorage.removeItem(TIMING_BUFFER_KEY)
  } catch {
    /* ignore disabled storage */
  }
}

api.interceptors.response.use(
  (response) => {
    const startedAt = response.config?.metadata?.startedAt
    const responseGeneration = response.config?.metadata?.sessionGeneration
    if (
      responseGeneration !== undefined
      && responseGeneration !== _apiSessionGeneration
    ) {
      return Promise.reject(new axios.CanceledError('Stale parent session response'))
    }
    if (
      startedAt != null &&
      response.config.metadata?.sessionGeneration === _apiSessionGeneration
    ) {
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
    if (
      originalRequest?.metadata?.sessionGeneration !== undefined &&
      originalRequest.metadata.sessionGeneration !== _apiSessionGeneration
    ) {
      // 前一位使用者的舊請求不可在登出後啟動 refresh 或其他全域 side effect。
      return Promise.reject(error)
    }
    const url = originalRequest?.url || ''
    const isAuthEndpoint =
      url.includes('/parent/auth/liff-login') ||
      url.includes('/parent/auth/bind') ||
      url.includes('/parent/auth/refresh') ||
      url.includes('/parent/auth/logout')

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
          const refresh = _doRefresh()
          const tracked = refresh.finally(() => {
            if (_refreshing === tracked) _refreshing = null
          })
          _refreshing = tracked
        }
        await _refreshing
        if (originalRequest?.metadata?.sessionGeneration !== _apiSessionGeneration) {
          throw new axios.CanceledError('Parent session changed before request retry')
        }
        // 不論 refresh 是本請求發起或共享自其他並發請求，都要重打原請求；
        // 重打若仍 401 才落到下方的 _redirectToLogin。
        return api(originalRequest!)
      } catch (refreshErr) {
        if (originalRequest?.metadata?.sessionGeneration !== _apiSessionGeneration) {
          return Promise.reject(refreshErr)
        }
        // refresh 真的失敗（過期 / 撤銷）才導去登入
        await _redirectToLogin()
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
      await _redirectToLogin()
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
        const r = await getParentRouter()
        if (r.currentRoute.value.path !== '/maintenance') {
          r.replace({
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

    // P2-4 consent gate：403 + X-Consent-Required header → 彈 re-consent modal
    // 不 return / 不 retry；讓 Promise.reject 照常傳給 caller，modal 為全域 side effect。
    const consentScope = error.response?.headers?.['x-consent-required']
    if (error.response?.status === 403 && consentScope) {
      useConsentGate().require(String(consentScope))
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
    error.errorType = classifyError(error)
    const friendlyFallback = DEFAULT_MESSAGES[error.errorType] ?? null
    if (
      rawDetail
      && !Array.isArray(rawDetail)
      && typeof rawDetail === 'object'
      && typeof (rawDetail as Record<string, unknown>).message === 'string'
    ) {
      const obj = rawDetail as Record<string, unknown>
      error.displayMessage = (obj.message as string) || friendlyFallback
      error.errorDetail = obj
    } else {
      const detailString = typeof rawDetail === 'string' ? rawDetail : null
      error.displayMessage = detailString || data?.message || friendlyFallback
      error.errorDetail = null
    }

    // 與管理端一致：預期的 4xx 留給 UI；非預期 5xx／network 才上報，且 URL
    // 必須先遮 path id 與 phone/email/id_number 等 query PII。
    const status = error.response?.status
    if (!error.response || (typeof status === 'number' && status >= 500)) {
      sentryCapture(error, {
        url: sanitizeUrl(error.config?.url),
        method: error.config?.method,
        status,
      }).catch(() => {})
    }
    return Promise.reject(error)
  },
)

// 已經在這幾個 public 頁時不需要（也不應該）把自己當 redirect 目標，避免
// 登入成功後被導回登入/綁定/維護頁這種無意義的自我循環；`/` 是純 redirect
// 到 /home 的根路由、不對應任何實際畫面，只會在 router 尚未完成初始導覽時
// 短暫出現（或測試沒有實際 push 過路由時的預設值），同樣不值得記。
const NO_REDIRECT_CAPTURE_PATHS = new Set(['/', '/login', '/bind', '/maintenance'])

async function _redirectToLogin(): Promise<void> {
  // 深連結保存：在清 local state（含目前路由狀態可能連動的 store）之前，
  // 先把「使用者這次 401 當下在哪一頁」記下來，登入成功後才回得去。
  let redirectTarget = ''
  try {
    const r = await getParentRouter()
    const current = r.currentRoute.value
    if (current?.path && !NO_REDIRECT_CAPTURE_PATHS.has(current.path)) {
      redirectTarget = current.fullPath || current.path
    }
  } catch {
    /* 拿不到目前路由就不帶 redirect，直接回登入頁 */
  }
  try {
    // 共用「主動登出」的本地清理單一來源；用 dynamic import 避免
    // useParentLogout -> api/index 的靜態循環依賴。
    const { clearParentLocalState } = await import('@/parent/composables/useParentLogout')
    await clearParentLocalState()
  } catch {
    /* 清理的某個瀏覽器 API 不可用時仍要回登入頁 */
  } finally {
    const target = redirectTarget
      ? `#/login?redirect=${encodeURIComponent(redirectTarget)}`
      : '#/login'
    if (window.location.hash !== target && !window.location.hash.startsWith('#/login')) {
      window.location.hash = target
    }
  }
}

export default api
