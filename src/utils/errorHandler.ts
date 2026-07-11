/**
 * 統一錯誤分類與訊息擷取工具。
 *
 * 設計目標：
 * - 各 view 不再手動解析 error.response.data.detail / message
 * - API interceptor 負責設定 error.displayMessage + error.errorType
 * - useErrorNotify composable 以分類決定 UI 行為（toast / dialog / silent）
 */

export const ErrorType = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'notfound',
  VALIDATION: 'validation',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  SERVER_ERROR: 'server_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  CANCELED: 'canceled',
  UNKNOWN: 'unknown',
})

export function classifyError(error: unknown) {
  if (!error) return ErrorType.UNKNOWN
  const e = error as { code?: string; name?: string; response?: { status: number } }

  if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError') {
    return ErrorType.CANCELED
  }
  if (e.code === 'ECONNABORTED') return ErrorType.TIMEOUT
  if (!e.response) return ErrorType.NETWORK_ERROR

  const status = e.response.status
  if (status === 401) return ErrorType.UNAUTHORIZED
  if (status === 403) return ErrorType.FORBIDDEN
  if (status === 404) return ErrorType.NOT_FOUND
  if (status === 409) return ErrorType.CONFLICT
  if (status === 422) return ErrorType.VALIDATION
  if (status === 429) return ErrorType.RATE_LIMITED
  if (status >= 500) return ErrorType.SERVER_ERROR
  return ErrorType.UNKNOWN
}

/**
 * 各 ErrorType 對應的預設使用者友善訊息。
 *
 * 由 `getErrorMessage` 與 axios interceptor (`src/api/index.ts`,
 * `src/parent/api/index.ts`) 共用：當後端沒有提供 `detail` 訊息時，
 * interceptor 會 fallback 到此表，避免顯示 axios 預設的
 * `Request failed with status code 500` 給使用者。
 *
 * SERVER_ERROR / NETWORK_ERROR / TIMEOUT 的文案經產品設計確認，
 * 內文需指向「稍後再試 / 檢查網路 / 聯絡園所」等可操作 hint。
 */
export const DEFAULT_MESSAGES: Record<string, string> = {
  [ErrorType.UNAUTHORIZED]: '登入逾期，請重新登入',
  [ErrorType.FORBIDDEN]: '權限不足，無法執行此操作',
  [ErrorType.NOT_FOUND]: '找不到資源',
  [ErrorType.VALIDATION]: '送出資料驗證失敗',
  [ErrorType.CONFLICT]: '資料衝突，請重新整理後再試',
  [ErrorType.RATE_LIMITED]: '請求過於頻繁，請稍後再試',
  [ErrorType.SERVER_ERROR]: '服務暫時無法使用，請稍後再試。若持續發生請聯絡園所',
  [ErrorType.NETWORK_ERROR]: '網路連線異常，請檢查網路後重試',
  [ErrorType.TIMEOUT]: '伺服器回應逾時，請稍後再試',
  [ErrorType.CANCELED]: '操作已取消',
  [ErrorType.UNKNOWN]: '操作失敗',
}

/**
 * 取得適合顯示給使用者的錯誤訊息。
 *
 * 優先順序：
 * 1. 後端回傳的 detail / message（error.displayMessage 由 interceptor 填入）
 * 2. 依錯誤分類的預設訊息
 * 3. caller 提供的 fallback
 */
export function getErrorMessage(error: unknown, fallback: string | null = null) {
  if (!error) return fallback || DEFAULT_MESSAGES[ErrorType.UNKNOWN]
  const e = error as { displayMessage?: string; response?: { data?: { detail?: unknown; message?: unknown } } }

  // interceptor 已正規化
  if (e.displayMessage) return e.displayMessage

  const fromDetail = e.response?.data?.detail
  if (typeof fromDetail === 'string') return fromDetail
  if (Array.isArray(fromDetail) && fromDetail.length) {
    // FastAPI 驗證錯誤陣列
    return (fromDetail[0] as { msg?: string })?.msg || fallback || DEFAULT_MESSAGES[ErrorType.VALIDATION]
  }

  const fromMessage = e.response?.data?.message
  if (typeof fromMessage === 'string') return fromMessage

  const type = classifyError(error)
  return fallback || DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES[ErrorType.UNKNOWN]
}

/**
 * 判斷錯誤是否應該「靜默忽略」（例如 request 被 AbortController 取消，
 * 或使用者主動取消了某個後續確認框——見 `error.silent === true` 通用標記，
 * 例如 StudentDuplicateCreateCancelled，src/utils/studentDuplicateConflict.ts）。
 */
export function isSilentError(error: unknown) {
  if (classifyError(error) === ErrorType.CANCELED) return true
  return (error as { silent?: unknown })?.silent === true
}
