/**
 * 家長端公開頁連結組裝。
 *
 * 公開報名走獨立的 public.html multi-page entry，router 為 hash mode
 * （src/public/router.ts，查詢頁路由為 `/activity/query`）。給家長複製/分享的
 * 「編修連結」必須組成：
 *
 *   <origin>/public.html#/activity/query?token=<token>
 *
 * token 一定要放在 `#`（hash）「之後」。否則：
 *   ① 生產 nginx 對非 hash 路徑（如 /public/activity/query）無 SPA fallback → 404；
 *   ② hash router 的 `route.query` 只解析 hash 內的 query，前 hash 的 ?token= 讀不到；
 *   ③ 前 hash 的 ?token= 會被瀏覽器送進 Referer，造成查詢碼外洩。
 *
 * （舊 bug：曾組成 `<origin>/public/activity/query?token=...`，前 hash 又用了
 *  public router 不存在的 /public 前綴，生產環境必 404。）
 */
export function buildPublicEditUrl(origin: string, queryToken?: string): string {
  if (!queryToken) return ''
  return `${origin}/public.html#/activity/query?token=${encodeURIComponent(queryToken)}`
}

/**
 * 對外公開的報名頁連結（老師貼到家長 LINE@／群組用），不帶任何 token：
 *
 *   <origin>/public.html#/activity
 *
 * 必須用 public.html entry 而非 admin SPA 的 `index.html#/public/activity`。後者只是
 * 相容舊連結的 fallback，會讓家長載入整包 admin bundle，且 LINE 聊天室抓到的預覽卡
 * 標題會是 index.html 的管理端標題（{{TB_ADMIN_TITLE}}，由 nginx 依 $host 注入）
 * ——家長看到的是一張管理系統的卡片。
 * 學期不必帶參數：公開端點的開放學期以後台「才藝設定與品項」的設定列為權威。
 */
export function buildPublicRegistrationUrl(origin: string): string {
  return `${origin}/public.html#/activity`
}
