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
