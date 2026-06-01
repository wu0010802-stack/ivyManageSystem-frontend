import axios from 'axios'
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { setUserInfo, clearAuth } from '@/utils/auth'
import { classifyError, DEFAULT_MESSAGES } from '@/utils/errorHandler'
import { applyDedupe } from '@/utils/apiDedupe'
import { captureException as sentryCapture, sanitizeUrl } from '@/utils/sentry'

// Lazy router import：直接 top-level import 會把 createRouter side effect 拉進
// 所有 import @/api 的測試（不少測試只 partial-mock vue-router 而沒 export
// createRouter），導致一票既有測試在 module load 階段就炸。
// 改成內部 cached promise，第一次遇到 503+MAINTENANCE_MODE 時才動態 import。
type RouterShape = {
    replace: (to: { path: string; query?: Record<string, string | undefined> }) => unknown
    currentRoute: { value: { path: string } }
}
let _routerPromise: Promise<RouterShape> | null = null
async function getRouter(): Promise<RouterShape> {
    if (!_routerPromise) {
        _routerPromise = import('@/router').then((m) => m.default as RouterShape)
    }
    return _routerPromise
}

// Extend axios types to cover the extra fields we attach in the interceptor.
declare module 'axios' {
    interface AxiosError {
        displayMessage?: string | null
        errorDetail?: unknown
        errorType?: string
    }
    interface InternalAxiosRequestConfig {
        _retried?: boolean
    }
}

// 統一 API base：api 實例 baseURL 與 token refresh 共用同一來源，避免 refresh
// 寫死 '/api' 而在自訂 VITE_API_BASE_URL 部署下打錯路徑（401 後刷新失敗 → 被踢登入頁）。
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/** token refresh 端點；與 api 實例同 base，不寫死 /api。 */
export function buildRefreshUrl(base: string = API_BASE): string {
    return `${base}/auth/refresh`
}

const api: AxiosInstance = axios.create({
    baseURL: API_BASE,
    // 30s：在 nginx upstream timeout（60s）前先 abort，讓 UI 有足夠時間等慢端點，
    // 不再讓使用者在 10s 看到「載入失敗」誤導訊息。
    timeout: 30000,
    withCredentials: true, // 自動攜帶 httpOnly Cookie
    headers: {
        'Content-Type': 'application/json'
    }
})

// 對 mutating 請求做同 key 去重，防止按鈕連點送出多筆
applyDedupe(api)

// 不再需要 request interceptor 注入 Authorization header
// Token 改由瀏覽器自動攜帶 httpOnly Cookie

// ---------- Token refresh logic ----------
let _refreshing: Promise<boolean> | null = null // 單一 refresh promise，避免併發多次刷新

function _doRefresh(): Promise<boolean> {
    // Cookie 會自動帶出，不需手動設定 header
    return axios.post(buildRefreshUrl(), null, {
        withCredentials: true,
        timeout: 30000,
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
    async (error: AxiosError) => {
        const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined

        // 只對 401 且非登入/refresh 請求嘗試刷新
        const isAuthEndpoint = originalRequest?.url?.includes('/auth/login')
            || originalRequest?.url?.includes('/auth/refresh')

        if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retried) {
            if (originalRequest) originalRequest._retried = true

            try {
                // 併發請求共用同一個 refresh promise
                if (!_refreshing) {
                    _refreshing = _doRefresh().finally(() => { _refreshing = null })
                }
                await _refreshing

                // 用新 Cookie 重試原本的請求（Cookie 自動帶出，不需手動設定 header）
                return api(originalRequest!)
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

        // Phase 4 kill switch（spec §4.4）：
        // 503 + envelope code === 'MAINTENANCE_MODE' → router.replace(/maintenance)
        // 503 + code === 'READ_ONLY_MODE' → ElMessage.warning（讓使用者知道編輯被擋）
        // 都立即 reject，不再進 displayMessage normalization（避免重複顯示通用文案）
        const killSwitchDetail = error.response?.data as { detail?: unknown } | undefined
        const killSwitchRaw = killSwitchDetail?.detail
        if (
            error.response?.status === 503
            && killSwitchRaw
            && typeof killSwitchRaw === 'object'
        ) {
            const ksObj = killSwitchRaw as { code?: unknown; message?: unknown }
            if (ksObj.code === 'MAINTENANCE_MODE') {
                // 已在 /maintenance 不重複 replace，避免本頁 refresh probe 觸發無窮 redirect
                const r = await getRouter()
                if (r.currentRoute.value.path !== '/maintenance') {
                    r.replace({
                        path: '/maintenance',
                        query: { message: typeof ksObj.message === 'string' ? ksObj.message : undefined },
                    })
                }
                // 仍要把 error 標好 displayMessage 給可能直接看 error 的呼叫者
                error.displayMessage = typeof ksObj.message === 'string' ? ksObj.message : '系統維護中，請稍後再試'
                error.errorDetail = ksObj
                error.errorType = classifyError(error)
                return Promise.reject(error)
            }
            if (ksObj.code === 'READ_ONLY_MODE') {
                ElMessage.warning(typeof ksObj.message === 'string' ? ksObj.message : '系統暫時唯讀，編輯功能暫不可用')
                error.displayMessage = typeof ksObj.message === 'string' ? ksObj.message : '系統暫時唯讀，編輯功能暫不可用'
                error.errorDetail = ksObj
                error.errorType = classifyError(error)
                return Promise.reject(error)
            }
        }

        // 正規化 UI 顯示用錯誤訊息，避免各元件重複解析 response 結構。
        //
        // 優先序（Phase 5 friendly-error 落地，spec §5.1）：
        // 1. envelope: detail.message（BusinessError）
        // 2. detail: 字串（HTTPException）
        // 3. responseData.message（少數舊 router 直接回 {message}）
        // 4. DEFAULT_MESSAGES[errorType]（5xx / network / timeout / 4xx 友善 fallback）
        // 5. null（最終 fallback，caller 自帶 fallback 文案）
        const responseData = error.response?.data as Record<string, unknown> | undefined
        const rawDetail = responseData?.detail
        error.errorType = classifyError(error)
        const friendlyFallback = DEFAULT_MESSAGES[error.errorType] ?? null
        if (rawDetail && typeof rawDetail === 'object' && (rawDetail as Record<string, unknown>).message) {
            // structured detail：把 message 摳出，保留完整物件供 mapEmployeeError 取用
            error.displayMessage = (rawDetail as Record<string, unknown>).message as string
            error.errorDetail = rawDetail  // 含 code / context
        } else {
            error.displayMessage = (rawDetail as string | null | undefined)
                || (responseData?.message as string | null | undefined)
                || friendlyFallback
            error.errorDetail = null
        }

        // Sentry 上報：>=500 server error 或 network error（無 response）；
        // 4xx 預期路徑（401/403/404/422 等）由 UI errorHandler 處理，不送 Sentry。
        // url 走 sanitizeUrl 才送：path id 去識別 + query 內 PII（phone/email/id_number...）遮罩，
        // 避免 ?phone=0912 / ?id_number=A1 等原樣灌進 Sentry extra。
        const status = error.response?.status
        if (!error.response || (typeof status === 'number' && status >= 500)) {
            sentryCapture(error, {
                url: sanitizeUrl(error.config?.url),
                method: error.config?.method,
                status,
            }).catch(() => {})
        }

        return Promise.reject(error)
    }
)

function _redirectToLogin() {
    const isPortal = window.location.hash.includes('/portal')
    clearAuth({ notifyServer: false })
    if (isPortal) {
        window.location.hash = '#/portal/login'
    } else {
        window.location.hash = '#/login'
    }
}

export default api
