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

function messageOf(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  const message = (err as { message?: unknown }).message
  return typeof message === 'string' ? message : String(err)
}

/**
 * 判斷並接手 chunk 載入錯誤，回傳是否由本函式接手。
 *
 * 給 **vue-router 的 `router.onError`** 用：lazy route 的 `import()` rejection 由
 * vue-router 自己 catch 掉，**不會**冒泡成 window 的 error / unhandledrejection，
 * 所以 installChunkSelfHeal 掛的那兩個監聽收不到——部署後舊 index.html 指向已被
 * 刪除的 hashed chunk 時，畫面只會換 URL 不換內容且毫無提示（2026-08-26 staging
 * 實測：EmployeeDetailView-*.js 404）。router.onError 必須顯式呼叫本函式。
 */
export function selfHealIfChunkError(err: unknown): boolean {
  if (!looksLikeChunkLoadError(messageOf(err))) return false
  void selfHealAndReload()
  return true
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
