/**
 * 家長端路由的捲動位置（router.ts 的 scrollBehavior）。
 *
 * 背景：App.vue 用 `<transition mode="out-in">` ＋ `:key="route.fullPath"`、沒有
 * KeepAlive。沒有 scrollBehavior 時：
 *  - 列表捲到一半進詳情，再按返回，列表重新掛載回到頂端，家長得重新找剛才那筆；
 *  - 進詳情時新頁沿用列表的捲動偏移，一進去就停在中段。
 *
 * 兩個時間差要處理：
 *  1. out-in 會等舊頁淡出（約 300ms）才掛新頁——太早捲動只會捲到正在淡出的舊頁。
 *     App.vue 在新頁插入時呼叫 notifyPageEntered()，這裡等它（有逾時保底）。
 *  2. 列表資料多半是掛載後才非同步載入，剛插入時頁面還太矮、捲不到原位置。
 *     返回時輪詢等到頁面高度足以捲到原位置（上限 RESTORE_MAX_WAIT_MS）；期間家長
 *     自己動了（觸控／滾輪／按鍵）就放棄還原，不跟手搶。
 */
import type { RouteLocationNormalized, RouterScrollBehavior } from 'vue-router'

/** out-in 淡出 300ms（App.vue）＋餘裕；首屏或被打斷的轉場不會觸發 enter，靠它保底 */
export const ENTER_TIMEOUT_MS = 700
/** 返回時等列表資料撐開頁面的上限 */
export const RESTORE_MAX_WAIT_MS = 1500
export const RESTORE_POLL_MS = 50

type Waiter = () => void
let enterWaiters: Waiter[] = []

/** App.vue 的 `<transition @enter>`：新頁已插入 DOM。 */
export function notifyPageEntered(): void {
  const waiters = enterWaiters
  enterWaiters = []
  waiters.forEach((resolve) => resolve())
}

/** 等下一次新頁插入；逾時也 resolve（首屏、轉場被下一次導覽打斷時不會有 enter）。 */
export function waitForPageEnter(timeoutMs = ENTER_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done: Waiter = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      enterWaiters = enterWaiters.filter((w) => w !== done)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    enterWaiters.push(done)
  })
}

function maxScrollTop(): number {
  const doc = document.documentElement
  return Math.max(0, doc.scrollHeight - window.innerHeight)
}

const INTERACTION_EVENTS = ['touchstart', 'wheel', 'keydown'] as const

/**
 * 等頁面高度足以捲到 top。回傳 false 表示期間家長自己動了（不該再還原）；
 * 逾時仍回 true——捲到能到的最遠處，比留在頂端更接近原位置。
 */
export function waitUntilScrollable(top: number, maxWaitMs = RESTORE_MAX_WAIT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let interacted = false
    const onInteract = () => { interacted = true }
    INTERACTION_EVENTS.forEach((type) => window.addEventListener(type, onInteract, { passive: true }))
    const startedAt = Date.now()
    const finish = (ok: boolean) => {
      INTERACTION_EVENTS.forEach((type) => window.removeEventListener(type, onInteract))
      resolve(ok)
    }
    const check = () => {
      if (interacted) return finish(false)
      if (maxScrollTop() >= top || Date.now() - startedAt >= maxWaitMs) return finish(true)
      setTimeout(check, RESTORE_POLL_MS)
    }
    check()
  })
}

function isFirstNavigation(from: RouteLocationNormalized): boolean {
  // START_LOCATION 沒有 matched
  return from.matched.length === 0
}

/**
 * @param isCurrent 目標路由是否仍是目前路由——等待期間家長可能已經又導覽到別頁，
 *   這時舊導覽的捲動結果不得套用到新頁。
 */
export function createParentScrollBehavior(isCurrent: (fullPath: string) => boolean): RouterScrollBehavior {
  return async (to, from, savedPosition) => {
    if (!isFirstNavigation(from)) await waitForPageEnter()
    if (!isCurrent(to.fullPath)) return false
    if (!savedPosition) return { left: 0, top: 0 }
    const ok = await waitUntilScrollable(savedPosition.top ?? 0)
    if (!ok || !isCurrent(to.fullPath)) return false
    return savedPosition
  }
}
