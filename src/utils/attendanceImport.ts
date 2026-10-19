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

// ── 匯入預覽逐列判讀 ──────────────────────────────────────────────────────────

/** 預覽列判讀需要的欄位（對齊 schema PreviewRow） */
export interface PreviewRowNoteInput {
  check: string
  problem_reason?: 'ambiguous_name' | 'not_employed' | null
  overwrite_mode?: 'replace' | 'fill_empty' | null
  existing_source?: string | null
}

const PROBLEM_REASON_LABELS: Record<NonNullable<PreviewRowNoteInput['problem_reason']>, string> = {
  ambiguous_name: '同名員工，請填寫工號',
  not_employed: '打卡日不在任職期間',
}

/** 既有出勤列的來源：補卡核准、手動補登、打卡機（kiosk）會被保護，匯入只補空白側 */
const PROTECTED_SOURCE_LABELS: Record<string, string> = {
  correction: '補卡',
  manual: '手動',
  kiosk: '打卡機',
}

/**
 * 比 check 更具體的說明：找不到員工的原因（同名、不在任職期間），或覆蓋列只補空白側。
 * 沒有更具體的說明回 null（照用 check 的標籤）。
 */
export function previewRowNote(row: PreviewRowNoteInput): string | null {
  if (row.problem_reason) return PROBLEM_REASON_LABELS[row.problem_reason] ?? null
  if (row.overwrite_mode === 'fill_empty') {
    const source = row.existing_source ? PROTECTED_SOURCE_LABELS[row.existing_source] ?? '' : ''
    return `保留既有${source}紀錄，只補空白側`
  }
  return null
}

/** 摘要：有幾筆既有補卡／手動／打卡機紀錄會被保留（只補空白側）；0 筆回空字串 */
export function protectedOverwritesText(count: number | null | undefined): string {
  if (!count || count <= 0) return ''
  return `其中 ${count} 筆既有補卡／手動／打卡機紀錄會保留，只補空白側。`
}

/** legacy 直接匯入：姓名對不到員工的列會被跳過，列出姓名讓人補對照；沒有回空字串 */
export function unmatchedNamesText(data: unknown): string {
  const names = (data as { unmatched_names?: unknown } | null)?.unmatched_names
  if (!Array.isArray(names)) return ''
  const list = names.filter((n): n is string => typeof n === 'string' && n !== '')
  if (!list.length) return ''
  return `${list.length} 位姓名未對到員工、未匯入：${list.join('、')}`
}
