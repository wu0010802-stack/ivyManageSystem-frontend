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

export function classifyError(error) {
  if (!error) return ErrorType.UNKNOWN

  if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
    return ErrorType.CANCELED
  }
  if (error.code === 'ECONNABORTED') return ErrorType.TIMEOUT
  if (!error.response) return ErrorType.NETWORK_ERROR

  const status = error.response.status
  if (status === 401) return ErrorType.UNAUTHORIZED
  if (status === 403) return ErrorType.FORBIDDEN
  if (status === 404) return ErrorType.NOT_FOUND
  if (status === 409) return ErrorType.CONFLICT
  if (status === 422) return ErrorType.VALIDATION
  if (status === 429) return ErrorType.RATE_LIMITED
  if (status >= 500) return ErrorType.SERVER_ERROR
  return ErrorType.UNKNOWN
}

const DEFAULT_MESSAGES = {
  [ErrorType.UNAUTHORIZED]: '登入逾期，請重新登入',
  [ErrorType.FORBIDDEN]: '權限不足，無法執行此操作',
  [ErrorType.NOT_FOUND]: '找不到資源',
  [ErrorType.VALIDATION]: '送出資料驗證失敗',
  [ErrorType.CONFLICT]: '資料衝突，請重新整理後再試',
  [ErrorType.RATE_LIMITED]: '請求過於頻繁，請稍後再試',
  [ErrorType.SERVER_ERROR]: '伺服器錯誤，請稍後再試',
  [ErrorType.NETWORK_ERROR]: '網路連線異常，請檢查網路',
  [ErrorType.TIMEOUT]: '請求逾時，請稍後再試',
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
export function getErrorMessage(error, fallback = null) {
  if (!error) return fallback || DEFAULT_MESSAGES[ErrorType.UNKNOWN]

  // interceptor 已正規化
  if (error.displayMessage) return error.displayMessage

  const fromDetail = error.response?.data?.detail
  if (typeof fromDetail === 'string') return fromDetail
  if (Array.isArray(fromDetail) && fromDetail.length) {
    // FastAPI 驗證錯誤陣列
    return fromDetail[0]?.msg || fallback || DEFAULT_MESSAGES[ErrorType.VALIDATION]
  }

  const fromMessage = error.response?.data?.message
  if (typeof fromMessage === 'string') return fromMessage

  const type = classifyError(error)
  return fallback || DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES[ErrorType.UNKNOWN]
}

/**
 * 判斷錯誤是否應該「靜默忽略」（例如 request 被 AbortController 取消）。
 */
export function isSilentError(error) {
  return classifyError(error) === ErrorType.CANCELED
}
