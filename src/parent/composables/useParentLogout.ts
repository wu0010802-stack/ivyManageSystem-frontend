import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { clearTodayStatusCache } from './useTodayStatusCache'
import { liff } from '../services/liff'

/**
 * 家長端統一登出清理。抽成單一來源，避免 MeView / MeDrawer 兩條 doLogout 漂移
 * （此 bug 即源於兩份重複實作其中一份漏清）：
 * - FE-2：清今日狀態快取（sessionStorage + in-memory），防共用裝置下一位家長
 *   在 60s TTL 內看到前一位家長孩子的今日狀態（PII）。
 * - FE-3：結束 LINE session，否則回 /login 後 liff.isLoggedIn() 仍為 true，
 *   下一位使用者會被自動以前一位家長身分重新認證（登出形同無效）。
 *
 * 路由跳轉與 UI（如關閉抽屜）由呼叫端自理。後端 logout 失敗時仍完成本地清理。
 */
export async function performParentLogout(): Promise<void> {
  const authStore = useParentAuthStore()
  try {
    await logout()
  } catch {
    /* 後端登出失敗仍續清本地，避免殘留 */
  } finally {
    clearTodayStatusCache()
    try {
      if (liff.isLoggedIn()) liff.logout()
    } catch {
      /* liff 未初始化等情況忽略 */
    }
    authStore.clear()
  }
}
