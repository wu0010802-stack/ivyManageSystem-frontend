// 通用「開新分頁顯示後端 PDF」helper（avoid Chrome HTML print CJK glyph bug）
//
// 為什麼這個 helper 存在：
//   後端 reportlab 內嵌 TTF 字型產生的 PDF，需要透過 axios（帶 JWT auth header）下載成 blob，
//   再用 blob URL 開新分頁讓 Chrome 原生 PDF viewer 顯示，使用者用 viewer 的列印鈕即可。
//   直接 window.open('/api/.../*.pdf') 不會帶 Authorization header → 401。
//
// 流程：
//   1. 同步開新分頁顯示「載入中…」（避免被 popup blocker 擋）
//   2. axios 帶 auth 取 PDF blob
//   3. 用 blob URL 重導入新分頁 → 原生 PDF viewer 顯示
//
// fetchBlob: () => Promise<Blob>（呼叫端傳入 axios 拿 PDF 的函式）
// loadingText: 可選，新分頁載入中顯示的文字（預設「PDF 載入中…」）
// onError: 可選，錯誤回呼

export async function openPdfInNewTab({ fetchBlob, loadingText = 'PDF 載入中…', onError } = {}) {
  if (typeof window === 'undefined') return null
  const win = window.open('', '_blank')
  if (!win) {
    onError && onError(new Error('瀏覽器封鎖了新分頁，請允許彈出視窗'))
    return null
  }
  win.document.write(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>載入中…</title></head><body style="font-family:sans-serif;padding:24px;color:#555">${loadingText}</body></html>`
  )

  let blobUrl = null
  try {
    const blob = await fetchBlob()
    blobUrl = URL.createObjectURL(blob)
    win.addEventListener(
      'load',
      () => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
          blobUrl = null
        }
      },
      { once: true }
    )
    setTimeout(() => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrl = null
      }
    }, 60_000)
    win.location.replace(blobUrl)
    return win
  } catch (err) {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
    }
    try {
      win.document.body.innerHTML =
        '<p style="font-family:sans-serif;padding:24px;color:#c33">PDF 載入失敗，請關閉視窗重試。</p>'
    } catch {
      // win 已被關閉時忽略
    }
    onError && onError(err)
    return null
  }
}
