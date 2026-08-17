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
import {
  flushAllParent,
  resetParentOfflineQueueRuntime,
  PARENT_KINDS,
} from '@/parent/utils/parentOfflineQueue'
import { listOpsForKinds } from '@/utils/offlineQueue'
// 注意：liff（@line/liff SDK ~30KB gz）改為登出時才 dynamic import。此 composable
// 經 MeView（/me route lazy component）引入；P2 起 MeDrawer 已移除掛載，本檔不再
// 落在首屏靜態鏈上，但維持動態 import liff 的既有決策不變（無急迫理由改回靜態，
// 且改動屬效能優化範疇，超出 P4 掃尾範圍）。

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
let remoteTabCleanup: Promise<void> = Promise.resolve()

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

export function clearParentLocalState(): Promise<void> {
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
  return purgePersonalizedRuntimeCaches()
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
        try {
          remoteTabCleanup = clearParentLocalState()
        } catch {
          // Pinia／storage 尚未初始化等同步失敗仍須允許後續 complete 收尾。
          remoteTabCleanup = Promise.resolve()
        }
        return
      }
      const cleanup = remoteTabCleanup
      const finishRemoteLogout = () => {
        // 若新的 logout-start 已開始，舊 complete 不得提前解除新一輪遮罩。
        if (remoteTabCleanup !== cleanup) return
        logoutInProgress.value = false
        redirectRemoteTabToLogin()
      }
      void cleanup.then(finishRemoteLogout, finishRemoteLogout)
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

/**
 * 登出前把離線佇列送出去（資安稽核 2026-08-17 SEC-24）。
 *
 * 佇列（IndexedDB `ivy-offline`）存的是尚未送出的請假／親師訊息 payload，
 * 含病名與訊息全文。登出流程原本完全不碰它，PII 會留在共用裝置上。
 *
 * 刻意**不用** `clearAll()`：佇列裡只會有 pending / needs_review 兩種狀態
 * （成功送出即 `removeOp`），無差別清除等同把家長離線寫的資料弄丟。改為先
 * 嘗試送出——成功的 op 自然被移除，PII 不殘留也不遺失；送不出去的仍保留，
 * 「不遺失」優先於「不殘留」，與 `offlineQueue.ts` 檔頭 CT-F-06 取捨一致。
 *
 * 必須在後端 `logout()` **之前**跑：登出後 cookie 失效，佇列只會拿到 401。
 * 但登出是使用者按下就該完成的操作，所以加上 timeout 上限，送不完就放著。
 */
export const LOGOUT_FLUSH_TIMEOUT_MS = 3000

async function flushPendingBeforeLogout(userId?: number | string): Promise<void> {
  if (!userId) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // 先確認真的有東西要送。`flushAllParent()` 帶 1 秒固定 debounce，佇列空著
    // 也會等——登出是使用者按下就該完成的操作，不能為了空佇列平白多等。
    const grouped = await listOpsForKinds({ kinds: [...PARENT_KINDS], userId })
    const hasPending = PARENT_KINDS.some((kind) => grouped[kind]?.pending?.length)
    if (!hasPending) return

    await Promise.race([
      flushAllParent(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS)
      }),
    ])
  } catch {
    /* 送不出去（離線／伺服器錯誤）就留在佇列，登出照常繼續 */
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function performParentLogout(): Promise<void> {
  logoutInProgress.value = true
  // 清理會把 authStore 清空，先留住 user_id 供稍後查佇列用。
  const flushUserId = (
    useParentAuthStore().user as { user_id?: number | string } | null
  )?.user_id
  broadcastParentSession({ type: 'logout-start' })
  // 本地狀態必須**先同步**清掉（既有不變式：後端 logout 的網路等待期間也不能
  // 讓上一位家長的 PII 回填畫面），所以 flush 只能排在它之後。
  // `resetParentApiSessionState()` abort 舊請求後會換上新的 AbortController，
  // 因此這之後才發起的 flush 請求不會被自己的清理中止。
  const cacheCleanup = clearParentLocalState()
  await flushPendingBeforeLogout(flushUserId)
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
  remoteTabCleanup = Promise.resolve()
  logoutInProgress.value = false
}
