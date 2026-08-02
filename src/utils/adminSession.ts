import { invalidateCachedAsync } from '@/composables/useCachedAsync'

/**
 * `local` = 本分頁自己發動的身分切換（login / logout / impersonate）；
 * `remote` = 另一分頁換了身分，本分頁必須連同 userInfo 一起失效並退出畫面。
 */
export interface AdminSessionResetContext {
  source: 'local' | 'remote'
}

type SessionResetListener = (context: AdminSessionResetContext) => void

/**
 * 跨分頁身分變更廣播頻道。刻意只放 opaque revision（不含 user / PII）：
 * localStorage 是同源共用的，任何寫進去的東西其他分頁都讀得到。
 */
export const ADMIN_SESSION_REVISION_KEY = 'ivy.admin.session.revision.v1'

let generation = 0
let sessionController = new AbortController()
const resetListeners = new Set<SessionResetListener>()
/** 本分頁最後一次認知的 revision；用來過濾自己送出的 storage event 回音。 */
let knownRevision: string | null = null

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

function applyAdminSessionReset(context: AdminSessionResetContext): number {
  generation += 1
  sessionController.abort()
  sessionController = new AbortController()
  invalidateCachedAsync()
  resetListeners.forEach((listener) => {
    try {
      listener(context)
    } catch {
      /* 單一 cleanup 失敗不得阻斷其他 session 隔離措施 */
    }
  })
  return generation
}

/**
 * 開始新的管理端身分世代。
 *
 * 順序刻意是先中止 IO，再清除跨頁 cache，最後通知 axios dedupe 等
 * 專用資源；這樣舊帳號的回應無法在新帳號畫面中回填。
 *
 * 最後才寫 revision 廣播：本分頁自己要先清乾淨，其他分頁才被通知。
 */
export function advanceAdminSession(): number {
  const nextGeneration = applyAdminSessionReset({ source: 'local' })
  knownRevision = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    localStorage.setItem(ADMIN_SESSION_REVISION_KEY, knownRevision)
  } catch {
    /* storage 被停用時退回單分頁 generation 隔離 */
  }
  return nextGeneration
}

function handleRemoteSessionRevision(event: StorageEvent): void {
  if (event.key !== ADMIN_SESSION_REVISION_KEY || !event.newValue) return
  // storage event 不會送回發動的分頁，但 revision 可能與本分頁剛寫入的值相同
  // （例如同值重寫）；比對後略過自己的回音，避免分頁間互相 reset 成迴圈。
  if (event.newValue === knownRevision) return

  knownRevision = event.newValue
  applyAdminSessionReset({ source: 'remote' })
}

function initAdminSessionIsolation(): void {
  try {
    knownRevision = localStorage.getItem(ADMIN_SESSION_REVISION_KEY)
  } catch {
    knownRevision = null
  }
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  window.addEventListener('storage', handleRemoteSessionRevision)
}

initAdminSessionIsolation()

export function onAdminSessionReset(listener: SessionResetListener): () => void {
  resetListeners.add(listener)
  return () => resetListeners.delete(listener)
}
