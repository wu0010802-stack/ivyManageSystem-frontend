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

/**
 * 掛 error / unhandledrejection 監聽，命中 chunk 載入錯誤即自救。三端 entry 各呼叫一次。
 *
 * `onChunkError`（選填，SPEC-023 批次 3 Task 3）：命中 chunk 載入錯誤時額外呼叫一次，
 * 只給**家長端** entry（`src/parent/main.ts`）用來把事件送進「家長端監控」
 * （`src/parent/utils/clientEvents.ts` 的 `chunk_load_failed`）。本檔是
 * admin／teacher／public／parent 四端共用的公用模組，**不可**在這裡直接 import
 * 家長端的 `clientEvents`——那會讓 admin/public 端的 chunk 錯誤也一起送進
 * `/api/parent/client-events`，污染監控資料，且該端點的 Host／cookie 情境與管理端
 * 完全不同。改用可選 callback，由呼叫端決定要不要接、接了要送去哪。callback 本身
 * 也包一層 try/catch：它是「附加的回報動作」，絕不能反過來讓自救流程（reload）
 * 失敗或變慢。
 */
export function installChunkSelfHeal(onChunkError?: (message: string) => void): void {
  const notify = (msg: string) => {
    try {
      onChunkError?.(msg)
    } catch {
      // 回報端（例如家長端 clientEvents）出錯不影響自救本身。
    }
  }
  window.addEventListener('error', (e: ErrorEvent) => {
    const errMsg = (e.error as { message?: string } | undefined)?.message
    const msg = e.message || errMsg || ''
    if (looksLikeChunkLoadError(msg)) {
      notify(msg)
      void selfHealAndReload()
    }
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string } | string | undefined
    const msg =
      (reason && (typeof reason === 'string' ? reason : reason.message || String(reason))) || ''
    if (looksLikeChunkLoadError(msg)) {
      notify(msg)
      void selfHealAndReload()
    }
  })
}
