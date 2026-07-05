// 考勤匯入結果彙整：後端 /attendance/upload-csv 與 /attendance/upload 對
// 「逐列失敗」回 HTTP 200，失敗數與錯誤明細放在 body results 內；呼叫端
// 不可只看 HTTP 狀態就顯示成功 toast（會把「資料沒寫入」誤報成功）。

export interface ImportResultSummary {
  /** results.failed 為 0（或無 results 欄位）即視為成功 */
  ok: boolean
  /** 給 toast 的文案：成功用後端 message；失敗附前 3 筆錯誤明細 */
  text: string
}

const MAX_ERRORS_SHOWN = 3
const FALLBACK_TEXT = '匯入完成'

interface CsvImportResponseShape {
  message?: unknown
  results?: { failed?: unknown; errors?: unknown }
}

export function summarizeCsvImportResult(data: unknown): ImportResultSummary {
  if (typeof data !== 'object' || data === null) {
    return { ok: true, text: FALLBACK_TEXT }
  }
  const shaped = data as CsvImportResponseShape
  const message = typeof shaped.message === 'string' ? shaped.message : FALLBACK_TEXT
  const failed = typeof shaped.results?.failed === 'number' ? shaped.results.failed : 0
  if (failed <= 0) {
    return { ok: true, text: message }
  }
  const errors = Array.isArray(shaped.results?.errors)
    ? shaped.results.errors.filter((e): e is string => typeof e === 'string')
    : []
  let text = message
  if (errors.length > 0) {
    text += `：${errors.slice(0, MAX_ERRORS_SHOWN).join('；')}`
    if (errors.length > MAX_ERRORS_SHOWN) {
      text += `（其餘 ${errors.length - MAX_ERRORS_SHOWN} 筆略）`
    }
  }
  return { ok: false, text }
}
