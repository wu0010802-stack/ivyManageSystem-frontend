/**
 * 從 axios error 提取最佳使用者顯示訊息。
 * 搭配 api/index.js 的 response interceptor，優先使用後端 detail。
 */
export function apiError(error, fallback = '操作失敗') {
    // displayMessage 由 interceptor 設定（生產環境）
    // 直接讀取 detail 作為備選（測試環境 / interceptor 未觸發時）
    return error?.displayMessage
        || error?.response?.data?.detail
        || error?.response?.data?.message
        || fallback
}

const EMPLOYEE_ERROR_HANDLERS = {
    SELF_FINANCE_EDIT_FORBIDDEN: (detail) => ({
        type: 'warning',
        message: detail.message,
        fields: detail.context?.fields || [],
        action: null,
    }),
    INSURANCE_BELOW_BASE: (detail) => ({
        type: 'error',
        message: detail.message,
        action: detail.context?.suggested != null
            ? { label: '同步為基本薪資', value: detail.context.suggested }
            : null,
    }),
    BELOW_MINIMUM_WAGE: (detail) => ({
        type: 'error',
        message: detail.message,
    }),
    EMPLOYEE_ID_DUPLICATE: (detail) => ({
        type: 'error',
        message: detail.message,
    }),
}

/**
 * 將 employee 流程結構化錯誤映射為 UI 顯示用 { type, message, action?, fields? }。
 * 結構化失敗（無 code）走 fallback。
 */
export function mapEmployeeError(error) {
    const detail = error?.errorDetail || error?.response?.data?.detail
    if (detail && typeof detail === 'object' && detail.code) {
        const handler = EMPLOYEE_ERROR_HANDLERS[detail.code]
        if (handler) return handler(detail)
        return { type: 'error', message: detail.message || '操作失敗' }
    }
    return { type: 'error', message: apiError(error, error?.message || '操作失敗') }
}
