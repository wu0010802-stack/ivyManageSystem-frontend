/** 以台北日曆日期計算快捷範圍；UTC 僅用於純日期加減，避免瀏覽器時區偏移。 */
function shiftDay(iso: string, offset: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function reconciliationRanges(year: number, month: number, today: string) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const first = `${prefix}-01`
  const last = `${prefix}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`
  const intersect = (start: string, end: string) => {
    const clippedStart = start < first ? first : start
    const clippedEnd = end > last ? last : end
    return clippedStart <= clippedEnd ? { start: clippedStart, end: clippedEnd } : null
  }
  const weekDay = new Date(`${today}T00:00:00Z`).getUTCDay()
  return {
    first, last,
    today: intersect(today, today),
    week: intersect(shiftDay(today, -((weekDay + 6) % 7)), today),
    elapsed: intersect(first, shiftDay(today, -1)),
    elapsedLabel: last < today ? '整月' : '本月至昨日',
  }
}

export function reconciliationRangeError(start: string, end: string, first: string, last: string): string {
  if (!start || !end) return '請選擇核對起日與迄日'
  if (start > end) return '核對起日不可晚於迄日'
  if ((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1 > 31) return '核對範圍不可超過 31 天'
  if (start < first || end > last) return '請選擇目前月份內的日期；跨月請先切換上方月份'
  return ''
}
