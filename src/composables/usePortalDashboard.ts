/**
 * 教師首頁 dashboard composable。
 *
 * 對外提供：
 * - summary：reactive ref（pinia state）
 * - loading / error
 * - refresh()：強制刷新
 * - onMutate(eventName, fn)：訂閱跨頁失效事件（讀訊息、發布聯絡簿後通知 invalidate）
 *
 * 失效廣播：用 window CustomEvent 'portal-dashboard-invalidate'，
 * 任何寫入動作後可 dispatch，讓 dashboard 在下次 router 進入時重抓。
 */

import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted } from 'vue'
import { usePortalDashboardStore } from '../stores/portalDashboard'

export const PORTAL_DASHBOARD_INVALIDATE_EVENT = 'portal-dashboard-invalidate'

export function broadcastDashboardInvalidate() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PORTAL_DASHBOARD_INVALIDATE_EVENT))
}

export function usePortalDashboard({ autoFetch = true } = {}) {
  const store = usePortalDashboardStore()
  const { summary, loading, error } = storeToRefs(store)

  async function refresh() {
    // 必須吞例外：refresh 被 PortalHomeView 直接當 @click handler 使用，往外拋會變成
    // 未處理的 rejection 冒到 App.vue 的 ErrorBoundary，把含側邊欄與 header 的整個
    // 教師端殼層換成錯誤頁（只能重載瀏覽器）。錯誤已由 store 記進 error，
    // 畫面靠既有的 error banner 降級即可。store 的 rethrow 保留給需要它的 caller。
    try {
      return await store.fetchSummary({ force: true })
    } catch {
      /* error 由 store 紀錄，UI 以 error banner 呈現 */
    }
  }

  function onInvalidateExternal() {
    store.invalidate()
    // 不立即 fetch；讓使用者下次進入再讀
  }

  onMounted(async () => {
    if (typeof window !== 'undefined') {
      window.addEventListener(
        PORTAL_DASHBOARD_INVALIDATE_EVENT,
        onInvalidateExternal,
      )
    }
    if (autoFetch) {
      try {
        await store.fetchSummary()
      } catch {
        /* error 由 store 紀錄 */
      }
    }
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(
        PORTAL_DASHBOARD_INVALIDATE_EVENT,
        onInvalidateExternal,
      )
    }
  })

  return {
    summary,
    loading,
    error,
    refresh,
  }
}
