import axios from 'axios'
import type { AxiosInstance, AxiosError, GenericAbortSignal, InternalAxiosRequestConfig } from 'axios'
import { setUserInfo, clearAuth } from '@/utils/auth'
import { classifyError, DEFAULT_MESSAGES } from '@/utils/errorHandler'
import { applyDedupe, clearDedupe } from '@/utils/apiDedupe'
import { captureException as sentryCapture, sanitizeUrl } from '@/utils/sentry'
import {
    getAdminSessionGeneration,
    getAdminSessionSignal,
    isAdminSessionCurrent,
    onAdminSessionReset,
} from '@/utils/adminSession'
import { tenantErrorCodeOf, tenantHeaders } from '@/utils/tenant'
import { showTenantBlocked } from '@/utils/tenantBlocked'

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
        _adminSessionGeneration?: number
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

function combineAbortSignals(existing: GenericAbortSignal | undefined, session: AbortSignal): AbortSignal {
    if (!existing) return session
    if (existing.aborted || session.aborted) return AbortSignal.abort()
    const combined = new AbortController()
    const abort = () => combined.abort()
    existing.addEventListener?.('abort', abort, { once: true })
    session.addEventListener('abort', abort, { once: true })
    return combined.signal
}

// Token 改由瀏覽器自動攜帶 httpOnly Cookie；request interceptor 只綁定
// session generation + AbortSignal，讓舊帳號 IO 在登入/登出/代操作切換時立即失效。
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    config._adminSessionGeneration = getAdminSessionGeneration()
    config.signal = combineAbortSignals(config.signal, getAdminSessionSignal())
    // 多租戶一致性 header（CT-A-05）：**Host 才是後端唯一的租戶來源**，這個 header
    // 只是斷言通道，供 middleware 比對「前端以為自己在哪一校」。單租戶模式回 {} →
    // 一個 header 都不加，行為與改造前逐字相同（DEV-12）。
    for (const [name, value] of Object.entries(tenantHeaders())) config.headers.set(name, value)
    return config
})

// ---------- Token refresh logic ----------
let _refreshing: Promise<boolean> | null = null // 單一 refresh promise，避免併發多次刷新

onAdminSessionReset(() => {
    _refreshing = null
    clearDedupe(api)
})

function _doRefresh(): Promise<boolean> {
    const generation = getAdminSessionGeneration()
    // Cookie 會自動帶出，不需手動設定 header
    // 裸 axios（不經上面的 request interceptor），tenant header 必須自己帶。
    return axios.post(buildRefreshUrl(), null, {
        withCredentials: true,
        timeout: 30000,
        signal: getAdminSessionSignal(),
        headers: tenantHeaders(),
    }).then(res => {
        if (!isAdminSessionCurrent(generation)) {
            throw new axios.CanceledError('Admin session changed during refresh')
        }
        // 後端已透過 Set-Cookie 更新 access_token，前端只需更新 userInfo
        const { user } = res.data
        if (user) setUserInfo(user)
        return true
    }).catch((err) => {
        // 409：staff refresh token rotation 的併發保護。後端 services/staff_refresh.py
        // 在 5 秒 race 視窗內對同一 token 的第二次請求回 409「rotation in progress」，
        // 意思是「另一條路徑已經刷新成功、session 仍有效，請重打原請求」——不是登入失效。
        // router guard / useIdleTimeout / axios 攔截器三條路會同時發 refresh，因此這個
        // 409 在正常使用下就會出現；當成失敗會把使用中的老師踢回登入頁。
        // 對齊 src/router/index.ts 與 src/parent/api/index.ts 對同一情境的既有處理。
        if ((err as { response?: { status?: number } })?.response?.status === 409) {
            return true
        }
        throw err
    })
}

// Handle errors + 401 auto-refresh + redirect
api.interceptors.response.use(
    response => {
        if (!isAdminSessionCurrent(response.config._adminSessionGeneration)) {
            return Promise.reject(new axios.CanceledError('Stale admin session response'))
        }
        return response
    },
    async (error: AxiosError) => {
        const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined

        // 前一位使用者的請求不得觸發 refresh、redirect、Sentry 或其他全域 side effect。
        if (
            originalRequest?._adminSessionGeneration !== undefined
            && !isAdminSessionCurrent(originalRequest._adminSessionGeneration)
        ) {
            return Promise.reject(error)
        }

        // 租戶三態（CT-A-03 + CT-F-01）**必須排在 401 refresh 之前**：
        // 404 TENANT_NOT_FOUND / 403 TENANT_SUSPENDED / 503 TENANT_PROVISIONING。
        // 這三種狀態下重試與 refresh 都無意義（不是身分問題是園所問題），而靜默
        // 顯示 default 品牌繼續跑是最危險的錯誤。直接掛全屏遮罩並 reject。
        const tenantErrorCode = tenantErrorCodeOf(error.response?.status, error.response?.data)
        if (tenantErrorCode) {
            showTenantBlocked(tenantErrorCode)
            error.errorDetail = error.response?.data
            error.errorType = classifyError(error)
            return Promise.reject(error)
        }

        // 只對 401 且非登入/refresh 請求嘗試刷新
        const isAuthEndpoint = originalRequest?.url?.includes('/auth/login')
            || originalRequest?.url?.includes('/auth/refresh')

        if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retried) {
            if (originalRequest) originalRequest._retried = true

            try {
                // 併發請求共用同一個 refresh promise
                if (!_refreshing) {
                    const refresh = _doRefresh()
                    const tracked = refresh.finally(() => {
                        if (_refreshing === tracked) _refreshing = null
                    })
                    _refreshing = tracked
                }
                await _refreshing

                if (!isAdminSessionCurrent(originalRequest?._adminSessionGeneration)) {
                    throw new axios.CanceledError('Admin session changed before request retry')
                }

                // 用新 Cookie 重試原本的請求（Cookie 自動帶出，不需手動設定 header）
                return api(originalRequest!)
            } catch (refreshError) {
                if (!isAdminSessionCurrent(originalRequest?._adminSessionGeneration)) {
                    return Promise.reject(refreshError)
                }
                // Refresh 也失敗，清除登入狀態並導向登入頁
                _redirectToLogin()
                return Promise.reject(refreshError)
            }
        }

        // 非 401 或已重試過仍失敗
        if (error.response?.status === 401 && !isAuthEndpoint) {
            _redirectToLogin()
        }

        // 下載端點用 responseType:'blob'：伺服器回 JSON 錯誤時 error.response.data 是 Blob，
        // 下方 killSwitch / displayMessage 正規化（讀 detail.message）讀不到 → 使用者只看到通用
        // 「下載失敗」。先把 application/json 的 blob 解析回物件，讓真實錯誤（如「本月薪資尚未封存」）
        // 浮現；一處集中修即覆蓋全部 blob 下載端點。非 JSON / 解析失敗則維持原 blob 走通用 fallback。
        const blobData = error.response?.data
        if (blobData instanceof Blob && blobData.type.includes('application/json')) {
            try {
                error.response!.data = JSON.parse(await blobData.text())
            } catch {
                /* 非 JSON 或解析失敗：維持原 blob，走通用 fallback */
            }
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
                // EP 動態 import：唯讀提示是罕見路徑，延遲載入避免 element-plus 成為
                // admin-core 硬依賴（污染 public/parent 首屏）。axios wrapper 邏輯不變。
                const { ElMessage } = await import('element-plus')
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
            // rawDetail 可能是 FastAPI 422 的「陣列」（[{loc,msg,type}...]）或 {code} 物件
            // （無 message）；typeof 皆為 'object' 但非字串。直接當 displayMessage 會違反
            // 宣告型別 string|null 並在 UI 渲染成 [object Object] / 原始陣列亂碼。僅採用
            // 字串 detail，其餘退 responseData.message / 友善 fallback（qa-loop round2 2026-06-29）。
            const detailStr = typeof rawDetail === 'string' ? rawDetail : null
            error.displayMessage = detailStr
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
    // 原本無聲瞬移 → 帶提示（EP 動態 import，同 READ_ONLY_MODE 模式，
    // 避免 element-plus 成為 public/parent chunk 硬依賴）
    import('element-plus')
        .then(({ ElMessage }) => ElMessage.warning('登入已逾期，請重新登入'))
        .catch(() => { /* silent */ })
    if (isPortal) {
        window.location.hash = '#/portal/login'
    } else {
        window.location.hash = '#/login'
    }
}

export default api
