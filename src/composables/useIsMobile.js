import { ref, onBeforeUnmount, getCurrentInstance } from 'vue'

const QUERY = '(max-width: 767px)'

/**
 * Reactive boolean reflecting whether viewport matches `(max-width: 767px)`.
 *
 * - 初始值直接讀 `window.matchMedia` 結果（無 SSR 場景，安全）
 * - listener 在元件 unmount 時自動 cleanup
 * - 回傳 `cleanup` 供測試或非元件情境主動釋放
 */
export function useIsMobile() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return { isMobile: ref(false), cleanup: () => {} }
    }
    const mql = window.matchMedia(QUERY)
    const isMobile = ref(mql.matches)
    const handler = (e) => { isMobile.value = e.matches }
    mql.addEventListener('change', handler)

    const cleanup = () => mql.removeEventListener('change', handler)

    // 僅在元件 setup 範圍內註冊 unmount hook；測試或非元件情境跳過
    if (getCurrentInstance()) onBeforeUnmount(cleanup)

    return { isMobile, cleanup }
}
