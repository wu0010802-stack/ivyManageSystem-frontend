import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 追蹤瀏覽器線上狀態。
 *
 * 注意：`navigator.onLine` 只看網卡，連得到 wifi 但 server 掛了仍會是 true。
 * 所以寫入操作在實際 POST 失敗（NETWORK_ERR）時也要 fallback 到佇列，
 * 不可只依賴這個 composable 的 `isOnline`。此 composable 主要用來：
 *   1. 顯示 UI 狀態提示
 *   2. 從 offline → online 時觸發同步 callback
 *
 * @param {Function} [onReconnect] - 轉為 online 時被呼叫（只在切換時觸發，不在初始值觸發）
 */
export function useOnlineStatus(onReconnect) {
    const isOnline = ref(
        typeof navigator !== 'undefined' ? navigator.onLine !== false : true
    )

    function handleOnline() {
        if (!isOnline.value) {
            isOnline.value = true
            if (typeof onReconnect === 'function') {
                try {
                    onReconnect()
                } catch (err) {
                    console.error('[useOnlineStatus] onReconnect threw:', err)
                }
            }
        }
    }

    function handleOffline() {
        isOnline.value = false
    }

    onMounted(() => {
        if (typeof window === 'undefined') return
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
    })

    onBeforeUnmount(() => {
        if (typeof window === 'undefined') return
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
    })

    return { isOnline }
}

/**
 * 判斷 axios error 是否為「網路層」失敗（而非 server 回的 4xx/5xx）。
 * 這種狀況要當離線處理，寫入要進佇列。
 */
export function isNetworkError(error) {
    if (!error) return false
    if (error.response) return false
    if (error.code === 'ERR_NETWORK') return true
    if (error.code === 'ECONNABORTED') return true
    if (error.message === 'Network Error') return true
    return false
}
