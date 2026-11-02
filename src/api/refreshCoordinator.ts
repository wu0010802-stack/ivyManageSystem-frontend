import type { AxiosResponse } from 'axios'
import { onAdminSessionReset } from '@/utils/adminSession'

/**
 * 職員端 `/auth/refresh` 的全頁唯一 in-flight。
 *
 * Why（day-qa F3，2026-11-02）：router guard／useIdleTimeout 走 `refreshSession()`、axios 401
 * 攔截器走 `_doRefresh()`，原本各有一個 inflight，同一分頁仍會同時打兩支 refresh。後端
 * staff_refresh 對同一 token 的第二支回 409（rotation in progress），攔截器若在勝出那支的
 * Set-Cookie 回來前就重打原請求，會帶舊 cookie 再 401 → 老師被踢回登入頁。
 *
 * 任一路徑要刷新都先經過這裡：已有進行中的就加入，沒有才由呼叫端提供的 `start` 發出。
 * 兩條路徑的回應同為 `{ user }`，可互相共用。
 */
type RefreshResponse = AxiosResponse<{ user?: unknown }>

let inflight: Promise<RefreshResponse> | null = null

onAdminSessionReset(() => {
  inflight = null
})

export function shareStaffRefresh(start: () => Promise<RefreshResponse>): Promise<RefreshResponse> {
  if (inflight) return inflight
  // 用 .finally 鏈接著儲存，避免有獨立未被 await 的 promise 鏈造成 unhandled rejection；
  // session 切換後可能已有新 refresh，舊 promise 完成時不可清掉新的。
  const tracked = start().finally(() => {
    if (inflight === tracked) inflight = null
  })
  inflight = tracked
  return tracked
}
