/**
 * 從 axios error 提取最佳使用者顯示訊息。
 * 搭配 api/index.js 的 response interceptor，優先使用後端 detail。
 */
export function apiError(error: unknown, fallback = '操作失敗') {
    // detail 標 unknown 而非 string：後端 BusinessError 回的是
    // `{code, message, request_id}` 物件，FastAPI 422 回的是 `[{loc,msg,type}]` 陣列，
    // 只有 HTTPException 才是字串。原本註記成 string 會讓呼叫端誤以為可直接串接。
    const e = error as {
        displayMessage?: string | null
        response?: { data?: { detail?: unknown; message?: string } }
    } | null

    // displayMessage 由 api/index.ts 的 interceptor 正規化（生產環境一定有值或
    // 明確為 null）。以下 detail 分支是測試環境 / interceptor 未觸發時的備援。
    if (e?.displayMessage) return e.displayMessage

    const detail = e?.response?.data?.detail
    if (typeof detail === 'string' && detail) return detail
    if (detail && typeof detail === 'object') {
        // structured detail：取 message，避免整個物件被當字串渲染成 [object Object]
        const message = (detail as { message?: unknown }).message
        if (typeof message === 'string' && message) return message
    }

    return e?.response?.data?.message || fallback
}

const EMPLOYEE_ERROR_HANDLERS: Record<string, (detail: { message?: string; code?: string; context?: { fields?: unknown[]; suggested?: unknown } }) => { type: string; message?: string; fields?: unknown[]; action?: { label: string; value: unknown } | null }> = {
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
export function mapEmployeeError(error: unknown) {
    const e = error as { errorDetail?: { message?: string; code?: string; context?: { fields?: unknown[]; suggested?: unknown } }; response?: { data?: { detail?: { message?: string; code?: string; context?: { fields?: unknown[]; suggested?: unknown } } } }; message?: string } | null
    const detail = e?.errorDetail || e?.response?.data?.detail
    if (detail && typeof detail === 'object' && detail.code) {
        const handler = EMPLOYEE_ERROR_HANDLERS[detail.code]
        if (handler) return handler(detail)
        return { type: 'error', message: detail.message || '操作失敗' }
    }
    return { type: 'error', message: apiError(error, e?.message || '操作失敗') }
}
