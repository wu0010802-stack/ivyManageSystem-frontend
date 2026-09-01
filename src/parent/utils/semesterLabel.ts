/**
 * 學期代碼 → 家長看得懂的標籤。
 *
 * 後端費用紀錄的 `period` 慣用內部代碼「114-2」（民國學年-學期序），對家長
 * 是無意義的行話；這裡轉成「114 學年下學期」。只轉「2~3 位學年 + 學期 1|2」
 * 的嚴格形態：「2026-03」（西元年月）、自由文字（夏令營）等原樣放行，
 * 避免把非學期代碼誤翻。
 */
const SEMESTER_CODE = /^(\d{2,3})-([12])$/

export function formatSemesterLabel(period: string | null | undefined): string {
  if (!period) return ''
  const m = SEMESTER_CODE.exec(period)
  if (!m) return period
  return `${m[1]} 學年${m[2] === '1' ? '上' : '下'}學期`
}
