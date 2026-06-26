/**
 * PWA 升級自救：偵測到 chunk hash 已被新部署移除（dynamic import 失敗、
 * 或瀏覽器丟 ChunkLoadError）時，主動清掉 SW + caches 再 reload 一次，
 * 避免舊 SW 命中已死的 chunk 造成白屏。sessionStorage flag 防迴圈。
 *
 * 原僅 admin entry（src/main.ts）；抽成共用 util 供三端 entry 各呼叫一次。
 */
const SELF_HEAL_FLAG = '__ivy_chunk_self_heal__'

/** 純函式：訊息是否像 chunk 載入失敗（供測試與 listener 共用）。 */
export function looksLikeChunkLoadError(message = ''): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    message,
  )
}

async function selfHealAndReload(): Promise<void> {
  if (sessionStorage.getItem(SELF_HEAL_FLAG)) return
  sessionStorage.setItem(SELF_HEAL_FLAG, '1')
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    location.reload()
  }
}

/** 掛 error / unhandledrejection 監聽，命中 chunk 載入錯誤即自救。三端 entry 各呼叫一次。 */
export function installChunkSelfHeal(): void {
  window.addEventListener('error', (e: ErrorEvent) => {
    const errMsg = (e.error as { message?: string } | undefined)?.message
    const msg = e.message || errMsg || ''
    if (looksLikeChunkLoadError(msg)) void selfHealAndReload()
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string } | string | undefined
    const msg =
      (reason && (typeof reason === 'string' ? reason : reason.message || String(reason))) || ''
    if (looksLikeChunkLoadError(msg)) void selfHealAndReload()
  })
}
