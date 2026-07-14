import { readonly, ref } from 'vue'
import { logout } from '../api/auth'
import { resetParentApiSessionState } from '../api/index'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'
import { useMessagesStore } from '../stores/messages'
import { clearTodayStatusCache } from './useTodayStatusCache'
import { clearChildSelection } from './useChildSelection'
import { clearFaqCache } from './useFaq'
import { useConsentGate } from './useConsentGate'
import { clearSnackbarQueue } from './useSnackbar'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import { resetParentOfflineQueueRuntime } from '@/parent/utils/parentOfflineQueue'
// 注意：liff（@line/liff SDK ~30KB gz）改為登出時才 dynamic import。此 composable
// 經 MeDrawer → ParentLayout → App.vue 靜態鏈落在家長首屏；若靜態 import liff 會把整包
// SDK 拖進首屏。登出是使用者動作，容忍一次動態載入（登入過的使用者該 chunk 已在快取）。

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
const PERSONALIZED_CACHE_PREFIXES = ['parent-', 'portal-'] as const
const PARENT_SESSION_CHANNEL = 'ivy-parent-session-v1'
const logoutInProgress = ref(false)
let parentSessionChannel: BroadcastChannel | null = null

type ParentSessionMessage = {
  type: 'logout-start' | 'logout-complete'
}

function redirectRemoteTabToLogin(): void {
  if (typeof window === 'undefined') return
  if (window.location.hash !== '#/login' && !window.location.hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
}

function isParentSessionMessage(value: unknown): value is ParentSessionMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'logout-start' || type === 'logout-complete'
}

async function purgePersonalizedRuntimeCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter((name) => PERSONALIZED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)))
        .map((name) => caches.delete(name)),
    )
  } catch {
    /* CacheStorage 不可用時仍繼續登出 */
  }
}

function clearParentLocalState(): void {
  const authStore = useParentAuthStore()
  // 先讓舊 async 工作失效，再清畫面資料；後端 logout 網路等待期間也不能回填 A 的 PII。
  resetParentApiSessionState()
  resetParentOfflineQueueRuntime()
  clearTodayStatusCache()
  invalidateCachedAsync('parent/')
  useChildrenStore().clear()
  useMessagesStore().clear()
  clearChildSelection()
  clearFaqCache()
  useConsentGate().reset()
  clearSnackbarQueue()
  try {
    sessionStorage.removeItem('parent_message_prefill')
    sessionStorage.removeItem('parent_liff_token_refresh_marker')
  } catch {
    /* ignore disabled storage */
  }
  authStore.clear()
}

/**
 * 建立跨分頁家長 session 通道。遠端 logout 只清本地狀態，不呼叫後端、也不重播訊息。
 * `logout-complete` 到達前維持 blocking shield，避免 LIFF 尚未登出就被登入頁自動認回舊帳號。
 */
export function initParentSessionIsolation(): void {
  if (parentSessionChannel || typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(PARENT_SESSION_CHANNEL)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isParentSessionMessage(event.data)) return
      if (event.data.type === 'logout-start') {
        logoutInProgress.value = true
        clearParentLocalState()
        return
      }
      logoutInProgress.value = false
      redirectRemoteTabToLogin()
    }
    parentSessionChannel = channel
  } catch {
    /* BroadcastChannel 不可用時維持單分頁清理 */
  }
}

function broadcastParentSession(message: ParentSessionMessage): void {
  initParentSessionIsolation()
  try {
    parentSessionChannel?.postMessage(message)
  } catch {
    /* 通道已被瀏覽器關閉時不阻斷本分頁登出 */
  }
}

export function useParentLogoutState() {
  initParentSessionIsolation()
  return { inProgress: readonly(logoutInProgress) }
}

export async function performParentLogout(): Promise<void> {
  logoutInProgress.value = true
  broadcastParentSession({ type: 'logout-start' })
  clearParentLocalState()
  const cacheCleanup = purgePersonalizedRuntimeCaches()
  try {
    await logout()
  } catch {
    /* 後端登出失敗仍續清本地，避免殘留 */
  } finally {
    await cacheCleanup
    try {
      const { liff } = await import('../services/liff')
      if (liff.isLoggedIn()) liff.logout()
    } catch {
      /* liff 未初始化等情況忽略 */
    }
    broadcastParentSession({ type: 'logout-complete' })
    logoutInProgress.value = false
  }
}

/** 測試專用：關閉 mock channel 並重置 module state。正式登出流程不會先關閉通道。 */
export function _resetParentLogoutIsolationForTesting(): void {
  parentSessionChannel?.close()
  parentSessionChannel = null
  logoutInProgress.value = false
}
