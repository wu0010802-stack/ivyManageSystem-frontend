import { apiErrorMessage } from './apiErrorMessage'

/**
 * 把「`responseType: 'blob'` 下載端點」的 axios 錯誤正規化成可顯示的中文訊息。
 *
 * Why（2026-08-15 POS code review P3-15）：blob 端點失敗時 `error.response.data`
 * 是 Blob 而不是 JSON 物件，呼叫端若只讀 `err.message`，使用者看到的是
 * 「Request failed with status code 400」——真正的原因（例如「該收據已作廢，無法列印」）
 * 被埋在 Blob 內容裡。
 *
 * `src/api/index.ts` 的攔截器已會把 `Content-Type: application/json` 的 Blob 解析回物件，
 * 但那條路徑挑 content-type、也解不到繞過攔截器（或 content-type 被代理改寫）的情形，
 * 所以這裡再做一次 fail-safe 解析：Blob → text → JSON → 交給既有的 `apiErrorMessage`
 * 取 `detail`（含 FastAPI 422 陣列 detail 的吞掉規則）。
 *
 * 解析不出來時一律回 fallback，不把 Blob 內容原樣潑到畫面上。
 */
export async function readBlobErrorDetail(err: unknown, fallback: string): Promise<string> {
  const e = err as { response?: { data?: unknown } } | null | undefined
  const data = e?.response?.data

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await data.text())
      const normalized = {
        ...(typeof err === 'object' && err !== null ? err : {}),
        response: { ...e?.response, data: parsed },
      }
      return apiErrorMessage(normalized, fallback)
    } catch {
      // 非 JSON（例如真的是壞掉的 PDF）或讀取失敗：走 fallback，不外洩原始內容
      return fallback
    }
  }

  return apiErrorMessage(err, fallback)
}
