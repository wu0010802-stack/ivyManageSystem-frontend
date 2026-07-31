/**
 * 把 axios 錯誤正規化成「可以直接顯示給家長看」的字串。
 *
 * Why（2026-07-31 稽核）：公開報名頁多處直接寫
 * `err.response.data.detail || '中文 fallback'`，並把型別宣告成 `detail?: string`。
 * 但 FastAPI 的 422 回應裡 `detail` 是 pydantic 的錯誤物件**陣列**
 * （`[{type, loc, msg, input, url}]`），是 truthy 值 → fallback 永遠輪不到，
 * 家長畫面上就出現一整包 JSON，還附 pydantic 官網的除錯連結。
 *
 * 規則：只有後端刻意回的字串 detail 才顯示；物件／陣列一律吞掉走中文 fallback，
 * 避免把技術細節（欄位路徑、輸入值）洩漏給未登入的公開頁訪客。
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    displayMessage?: unknown
    response?: { data?: { detail?: unknown; message?: unknown } }
  }

  // axios 攔截器（src/api/index.ts）已正規化過的訊息優先
  if (typeof e?.displayMessage === 'string' && e.displayMessage.trim()) {
    return e.displayMessage
  }

  const detail = e?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail

  // 部分端點用 envelope 形式 { detail: { code, message } }
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const msg = (detail as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }

  const topMessage = e?.response?.data?.message
  if (typeof topMessage === 'string' && topMessage.trim()) return topMessage

  return fallback
}
