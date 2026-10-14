/**
 * 家長端「載入失敗」的分流判斷。
 *
 * 載入失敗不得畫成「沒有資料／找不到」：連線失敗、伺服器錯誤要給可重試的錯誤態
 * （MobileErrorRetry），只有後端明確回 404 才是真的找不到。兩者混在一起時，家長
 * 會以為待簽文件、請假紀錄、用藥單「不見了」，而不是「等一下再試」。
 */

/** 後端明確回 404（資源不存在／已刪除／不屬於這位家長）。 */
export function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { response?: { status?: unknown } }).response?.status
  return status === 404
}

/** 取 interceptor 正規化後的家長可讀訊息；沒有就用 fallback。 */
export function loadErrorMessage(err: unknown, fallback = '載入失敗，請稍後再試'): string {
  if (err && typeof err === 'object') {
    const msg = (err as { displayMessage?: unknown }).displayMessage
    if (typeof msg === 'string' && msg) return msg
  }
  return fallback
}
