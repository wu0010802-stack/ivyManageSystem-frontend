/**
 * 報名時間設定「儲存確認」文案（2026-07-08）。
 *
 * Why: 後台曾把 open_at/close_at 存成非預期年份（如 2021/2029）而沒被發現，
 * 造成時間窗形同永遠開放。儲存前把實際生效的時間窗與異常提示攤在確認框裡，
 * 讓錯誤年份/已過期的截止時間在按下「確定儲存」前就能被看見。
 *
 * 時間比較一律用 `YYYY-MM-DDTHH:mm` 字串字典序（與 el-date-picker 的
 * value-format 一致），不對 naive 字串 new Date()（遵守 datetime 規範）。
 */

export interface RegistrationWindowForm {
  is_open: boolean
  open_at: string | null
  close_at: string | null
  /** 本次開放報名的學期；null 代表未指定（前台改依系統日期推算當期）。 */
  school_year?: number | null
  semester?: number | null
}

/** 取台北時區當下時間的 `YYYY-MM-DDTHH:mm` 字串（與 value-format 同構）。 */
export function taipeiNowMinuteString(): string {
  // sv-SE locale 輸出 "YYYY-MM-DD HH:mm:ss"，轉成 value-format 同構字串
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' })
    .slice(0, 16)
    .replace(' ', 'T')
}

function fmt(v: string | null): string {
  return v ? v.replace('T', ' ') : '未設定'
}

/**
 * 學期文案。未指定學期是最容易出事的設定：前台會改用系統日期推算當期，
 * 在學期交界（例如 7 月底已建好下學期課程）時就會顯示另一個學期的課程與用品，
 * 所以這裡明講後果而不只是寫「未指定」。
 */
function fmtTerm(form: RegistrationWindowForm): string {
  if (form.school_year == null || form.semester == null) {
    return '未指定（前台依系統日期判斷當期，學期交界時可能顯示到另一學期的課程／用品）'
  }
  return `${form.school_year} 學年度 ${form.semester === 1 ? '上' : '下'}學期`
}

/**
 * 產生儲存確認框逐行文案。
 * @param form 目前表單的開關與起訖時間
 * @param nowStr 台北當下時間（`YYYY-MM-DDTHH:mm`），由 taipeiNowMinuteString() 提供
 */
export function buildSaveConfirmLines(form: RegistrationWindowForm, nowStr: string): string[] {
  const lines = [
    `報名開關：${form.is_open ? '開放報名' : '關閉報名'}`,
    `開放學期：${fmtTerm(form)}`,
    `報名期間：${fmt(form.open_at)} ～ ${fmt(form.close_at)}`,
  ]
  if (!form.is_open) {
    lines.push('開關為關閉：前台將顯示「報名尚未開放」，期間設定不生效。')
    return lines
  }
  if (form.close_at && form.close_at <= nowStr) {
    lines.push('⚠ 截止時間已是過去時間，前台將顯示「報名已截止」，無法報名。')
  } else if (form.open_at && form.open_at > nowStr) {
    lines.push(`⚠ 開放時間尚未到，前台在 ${fmt(form.open_at)} 前將顯示「報名尚未開始」。`)
  }
  if (!form.open_at && !form.close_at) {
    lines.push('未設定起訖時間：前台將立即開放且無截止時間。')
  }
  return lines
}
