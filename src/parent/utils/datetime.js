/**
 * 家長 App 共用日期時間格式化。
 *
 * 統一走 Intl.DateTimeFormat（zh-Hant-TW），避免各 view 自己拼字串、
 * 將來 i18n 與時區處理才不痛。
 *
 * 所有 fn 接受 ISO string / Date / null。null/invalid 一律回 '' 不丟錯。
 */

const TZ = 'Asia/Taipei'
const LOCALE = 'zh-Hant-TW'

function toDate(input) {
  if (!input) return null
  if (input instanceof Date) return isNaN(input) ? null : input
  const d = new Date(input)
  return isNaN(d) ? null : d
}

const TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ,
})

const SHORT_DATE_FMT = new Intl.DateTimeFormat(LOCALE, {
  month: 'numeric',
  day: 'numeric',
  timeZone: TZ,
})

const FULL_DATE_FMT = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TZ,
})

const DATETIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ,
})

/** 今日顯示 HH:mm，其他日顯示 M/D（聊天/通知列表用） */
export function fmtTimeOrDate(input) {
  const d = toDate(input)
  if (!d) return ''
  const today = new Date()
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return TIME_FMT.format(d)
  }
  return SHORT_DATE_FMT.format(d)
}

/** HH:mm */
export function fmtTime(input) {
  const d = toDate(input)
  return d ? TIME_FMT.format(d) : ''
}

/** M/D */
export function fmtShortDate(input) {
  const d = toDate(input)
  return d ? SHORT_DATE_FMT.format(d) : ''
}

/** YYYY/MM/DD */
export function fmtDate(input) {
  const d = toDate(input)
  return d ? FULL_DATE_FMT.format(d) : ''
}

/** YYYY/MM/DD HH:mm */
export function fmtDateTime(input) {
  const d = toDate(input)
  return d ? DATETIME_FMT.format(d) : ''
}

/**
 * 相對時間文案（剛才 / N 分鐘前 / N 小時前 / 昨天 / M/D）。
 * 給訊息 / 通知列表用。
 */
export function fmtRelative(input) {
  const d = toDate(input)
  if (!d) return ''
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return '剛才'
  if (diffMin < 60) return `${diffMin} 分鐘前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小時前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return '昨天'
  if (diffDay < 7) return `${diffDay} 天前`
  return SHORT_DATE_FMT.format(d)
}
