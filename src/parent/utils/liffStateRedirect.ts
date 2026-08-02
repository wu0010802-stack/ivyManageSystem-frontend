/**
 * LIFF 連結誤指公開頁的攔截：liff.line.me/{id}/public.html#/... 這類 permalink
 * 一律先載入家長端 endpoint（本 entry），LIFF SDK 才依 liff.state 改寫網址列——
 * 結果是「網址顯示 public.html、畫面卻是家長端登入」。家長端 boot 時若發現
 * liff.state 指向公開頁，直接整頁跳轉過去，讓誤包 LIFF 的分享連結仍能到達目的地。
 *
 * 僅接受以 /public.html 開頭、且後面緊接 [/?#] 或字串結尾的同源路徑：
 * liff.state 是外部可控的 query 參數，放寬比對會變成 open redirect。
 */
const PUBLIC_ENTRY_TARGET = /^\/public\.html([/?#]|$)/

export function resolvePublicLiffStateTarget(search: string): string | null {
  const state = new URLSearchParams(search).get('liff.state')
  if (state && PUBLIC_ENTRY_TARGET.test(state)) return state
  return null
}
