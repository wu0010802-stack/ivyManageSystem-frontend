import { invalidateCachedAsync } from '@/composables/useCachedAsync'

type SessionResetListener = () => void

let generation = 0
let sessionController = new AbortController()
const resetListeners = new Set<SessionResetListener>()

/** 目前管理端身分世代；每次登入、登出或代操作切換都會遞增。 */
export function getAdminSessionGeneration(): number {
  return generation
}

/** 供 API 請求綁定當前身分，切換身分時可一次中止所有舊請求。 */
export function getAdminSessionSignal(): AbortSignal {
  return sessionController.signal
}

export function isAdminSessionCurrent(candidate: number | undefined): boolean {
  return candidate !== undefined && candidate === generation
}

/**
 * 開始新的管理端身分世代。
 *
 * 順序刻意是先中止 IO，再清除跨頁 cache，最後通知 axios dedupe 等
 * 專用資源；這樣舊帳號的回應無法在新帳號畫面中回填。
 */
export function advanceAdminSession(): number {
  generation += 1
  sessionController.abort()
  sessionController = new AbortController()
  invalidateCachedAsync()
  resetListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      /* 單一 cleanup 失敗不得阻斷其他 session 隔離措施 */
    }
  })
  return generation
}

export function onAdminSessionReset(listener: SessionResetListener): () => void {
  resetListeners.add(listener)
  return () => resetListeners.delete(listener)
}
