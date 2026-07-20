/**
 * 全站失敗訊息 helper：讓每個錯誤 toast 回答「發生了什麼＋使用者能做什麼」。
 *
 * 使用方式（catch 內）：
 *   ElMessage.error(friendlyError('載入請假清單失敗', e))
 *   // → 「載入請假清單失敗：無權限存取。請確認帳號權限或聯絡系統管理員」
 *
 * 訊息組成：`${action}：${原因＋下一步}`
 * 原因來源優先序：
 *   1. 後端 detail / interceptor displayMessage（僅在「繁中且非技術訊息」時透傳，
 *      白名單化避免 stack trace / axios 英文訊息直出）
 *   2. 依 classifyError 分類的預設原因（網路 / 逾時 / 403 / 404 / 422 / 5xx）
 *   3. 通用下一步（無 err 或無法分類時）
 *
 * 規範：全繁中、不用驚嘆號、不用 em dash。
 */
import { classifyError, ErrorType, DEFAULT_MESSAGES } from './errorHandler'

/** 無法給出具體原因時的通用下一步。 */
export const GENERIC_NEXT_STEP = '請重試，若持續發生請聯絡系統管理員'

/** 各錯誤分類對應的「原因＋下一步」句。 */
const REASON_BY_TYPE: Record<string, string> = {
  [ErrorType.FORBIDDEN]: '無權限存取。請確認帳號權限或聯絡系統管理員',
  [ErrorType.NOT_FOUND]: '找不到對應資料，可能已被移除。請重新整理頁面後再試',
  [ErrorType.VALIDATION]: '送出的資料未通過驗證。請檢查欄位內容後重新送出',
  [ErrorType.CONFLICT]: '資料已被其他人異動。請重新整理頁面後再試',
  [ErrorType.RATE_LIMITED]: '操作過於頻繁。請稍候片刻再試',
  [ErrorType.SERVER_ERROR]: '伺服器發生錯誤。請稍後重試，若持續發生請聯絡系統管理員',
  [ErrorType.NETWORK_ERROR]: '網路連線異常，請檢查連線後重試',
  [ErrorType.TIMEOUT]: '伺服器回應逾時。請稍後重試',
  [ErrorType.CANCELED]: '操作已取消',
}

/** 疑似技術訊息（stack / 英文錯誤 / HTML）不透傳給使用者。 */
const TECHNICAL_PATTERNS = [
  /traceback/i,
  /exception/i,
  /request failed/i,
  /network error/i,
  /timeout/i,
  /<\/?[a-z][^>]*>/i, // HTML tag
  /\bat\s+\S+\.(js|ts|vue)/, // stack frame
]

const CJK_RE = /[一-鿿]/

/**
 * interceptor 的通用 fallback 文案（DEFAULT_MESSAGES）不當「後端訊息」透傳：
 * REASON_BY_TYPE 針對同類錯誤有更完整的「原因＋下一步」句，優先走分類路徑。
 */
const INTERCEPTOR_FALLBACKS = new Set(Object.values(DEFAULT_MESSAGES))

/**
 * 從 error 物件萃取可安全顯示的後端訊息。
 * 僅接受「含繁中、非技術樣式、長度合理」的字串，其餘回 null 走分類 fallback。
 */
function extractSafeDetail(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as {
    displayMessage?: unknown
    errorDetail?: unknown
    response?: { data?: { detail?: unknown; message?: unknown } }
  }
  const rawDetail = e.response?.data?.detail
  const structuredDetailMessage =
    rawDetail && typeof rawDetail === 'object' && !Array.isArray(rawDetail)
      ? (rawDetail as { message?: unknown }).message
      : undefined
  const candidates: unknown[] = [
    e.displayMessage,
    (e.errorDetail as { message?: unknown } | null | undefined)?.message,
    rawDetail,
    structuredDetailMessage,
    e.response?.data?.message,
  ]
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const text = c.trim()
    if (!text || text.length > 200) continue
    if (!CJK_RE.test(text)) continue
    if (INTERCEPTOR_FALLBACKS.has(text)) continue
    if (TECHNICAL_PATTERNS.some((re) => re.test(text))) continue
    return text
  }
  return null
}

/**
 * 產生「動作失敗：原因。下一步」格式的使用者友善訊息。
 *
 * @param action 完整動作片語（含「失敗」），如「載入請假清單失敗」「儲存加班單失敗」
 * @param err    catch 到的錯誤（axios error 或任意 unknown）；省略時給通用下一步
 */
export function friendlyError(action: string, err?: unknown): string {
  if (err === undefined || err === null) {
    return `${action}：${GENERIC_NEXT_STEP}`
  }

  const detail = extractSafeDetail(err)
  if (detail) {
    // 後端訊息已含動作片語時不重複前綴（如 detail 本身就是「××失敗：…」）
    const body = detail.startsWith(action) ? detail : `${action}：${detail}`
    // 後端訊息若未給任何指示（無「請」字），補通用下一步
    return /請/.test(detail) ? body : `${body}。${GENERIC_NEXT_STEP}`
  }

  const type = classifyError(err)
  const reason = REASON_BY_TYPE[type]
  if (reason) return `${action}：${reason}`
  return `${action}：${GENERIC_NEXT_STEP}`
}
