/**
 * 家長端頂部返回鍵的去向判斷（純函式，ParentLayout 的 onBack 用）。
 *
 * 為什麼不用 `window.history.length > 1`：家長端常從 LINE 推播深連結直接開
 * 詳情頁，進來前瀏覽器分頁裡已有 LIFF 啟動頁、LINE OAuth 授權頁等站外紀錄，
 * history.length 會把它們算進去——按返回不是回到 App 裡的上一頁，而是退出
 * App，或退回 LIFF 啟動頁又被轉回同一頁（循環）。
 *
 * 改看 vue-router 自己寫進 history.state 的 `back`：它只記「站內」上一個
 * 位置（深連結第一頁、replace 進來的頁面都是 null）。沒有站內上一頁時：
 *   1. 路由 `meta.backTo` 指定的落點
 *   2. 同分頁裡路徑上最近的一層（/events/3/ack → /events、/sign/5 → /sign、
 *      /children/5/photos → /children/5），讓「從推播打開某份通知」按返回
 *      回到該功能的清單，而不是被丟到分頁根頁再找一次
 *   3. 所屬分頁的根頁（meta.tab）
 *   4. 首頁
 */

/** 底部五個分頁的根頁（key 與 ParentLayout TABS、各路由 meta.tab 一致）。 */
export const TAB_ROOT_PATHS: Readonly<Record<string, string>> = {
  home: '/home',
  child: '/child',
  'contact-book': '/contact-book',
  admin: '/admin',
  me: '/me',
}

const DEFAULT_ROOT = '/home'

export interface BackRouteMeta {
  tab?: unknown
  backTo?: unknown
}

/** 查某個站內路徑對應的路由：不存在（catch-all／redirect）回 null。 */
export type RouteLookup = (path: string) => { tab?: unknown; public?: unknown } | null

/** `/a/b/c` → [`/a/b`, `/a`]（由近到遠，不含根 `/`）。query／hash 不參與。 */
export function ancestorPaths(path: string): string[] {
  const segments = path.split(/[?#]/)[0].split('/').filter(Boolean)
  const out: string[] = []
  for (let i = segments.length - 1; i >= 1; i -= 1) {
    out.push(`/${segments.slice(0, i).join('/')}`)
  }
  return out
}

/** 沒有站內上一頁時的落點（優先序見檔頭）。 */
export function backFallbackPath(
  currentPath: string,
  meta: BackRouteMeta | null | undefined,
  lookup?: RouteLookup,
): string {
  const backTo = meta?.backTo
  if (typeof backTo === 'string' && backTo.startsWith('/')) return backTo
  const tab = typeof meta?.tab === 'string' ? meta.tab : ''
  if (lookup && tab) {
    for (const candidate of ancestorPaths(currentPath)) {
      const found = lookup(candidate)
      if (found && found.public !== true && found.tab === tab) return candidate
    }
  }
  return TAB_ROOT_PATHS[tab] ?? DEFAULT_ROOT
}

/**
 * vue-router 寫進 history.state 的站內上一頁；沒有（深連結第一頁）回 null。
 * state 來自瀏覽器，型別不可信，逐欄收斂。
 */
export function inAppPreviousPath(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null
  const back = (state as { back?: unknown }).back
  return typeof back === 'string' && back.length > 0 ? back : null
}

export type BackAction = { type: 'back' } | { type: 'replace'; path: string }

/**
 * @param state   `router.options.history.state`
 * @param current 目前路由的 path 與 meta
 * @param lookup  查路由（ParentLayout 用 router.resolve 實作）；上一頁若是登入／
 *                綁定等公開頁，退回去沒有意義（已登入會被再轉走），改走 fallback。
 */
export function resolveBackAction(
  state: unknown,
  current: { path: string; meta?: BackRouteMeta | null },
  lookup?: RouteLookup,
): BackAction {
  const previous = inAppPreviousPath(state)
  if (previous && lookup?.(previous)?.public !== true) return { type: 'back' }
  return { type: 'replace', path: backFallbackPath(current.path, current.meta, lookup) }
}
