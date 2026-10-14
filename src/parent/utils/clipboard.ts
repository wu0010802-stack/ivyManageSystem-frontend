/**
 * 家長端複製文字（取件碼、管理連結、匯款資訊）。
 *
 * LINE 內建瀏覽器／舊版 iOS WebView 常拒絕 `navigator.clipboard`（權限或非安全
 * 環境），所以失敗時退回暫時 textarea + `execCommand('copy')`。兩條都失敗回
 * false，由呼叫端提示家長長按手動複製——不得默默當作成功。
 */
export async function copyText(text: string | null | undefined): Promise<boolean> {
  if (!text) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 權限被拒／非安全環境：落到下方 fallback
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  // 移出畫面、不觸發捲動；16px 避免 iOS 在 select() 聚焦時放大整頁
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '-9999px'
  ta.style.fontSize = '16px'
  document.body.appendChild(ta)
  try {
    ta.select()
    ta.setSelectionRange(0, text.length)
    return typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}
