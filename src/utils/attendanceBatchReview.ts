import type { ApiResponse } from '@/api/_generated/typed'
type PunchRow = Pick<ApiResponse<'/attendance/upload/preview', 'post'>['rows'][number], 'punches'>
export type ReviewEdit = { punch_in: string; punch_out: string; confirmed: boolean }
export type ReviewAction = 'current' | 'in' | 'out'
export type ReviewFilter = 'all' | 'multi' | 'single' | 'duplicate' | 'unconfirmed'

export function punchTime(value: string): string { return value.slice(11, 16) }
export function punchOptions(row: PunchRow): string[] {
  return [...new Set((row.punches ?? []).map(punchTime).filter(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort()
}
export function proposeReview(row: PunchRow, edit: ReviewEdit, action: ReviewAction): { edit: ReviewEdit | null; error: string } {
  const times = punchOptions(row)
  const result = action === 'in' ? { punch_in: times[0] ?? '', punch_out: '', confirmed: true }
    : action === 'out' ? { punch_in: '', punch_out: times[times.length - 1] ?? '', confirmed: true }
    : { ...edit, confirmed: true }
  let error = ''
  if (!result.punch_in && !result.punch_out) error = '至少選擇一筆原始刷卡'
  else if ([result.punch_in, result.punch_out].some(time => time && !times.includes(time))) error = '時間必須來自原始刷卡'
  else if (result.punch_in && result.punch_out && result.punch_in >= result.punch_out) error = '下班須晚於上班，請調整時間或保留單側缺卡'
  return { edit: error ? null : result, error }
}
export function reviewReasons(row: PunchRow): string[] {
  const punches = row.punches ?? []
  const reasons = []
  if (punches.length === 1) reasons.push('單筆刷卡')
  if (punches.length > 2) reasons.push('多筆刷卡')
  if (new Set(punches.map(punchTime)).size < punches.length) reasons.push('重複刷卡')
  return reasons
}
export function matchesReviewFilter(row: PunchRow, edit: ReviewEdit, filter: ReviewFilter): boolean {
  if (filter === 'unconfirmed') return !edit.confirmed
  if (filter === 'single') return row.punches?.length === 1
  if (filter === 'multi') return (row.punches?.length ?? 0) > 2
  if (filter === 'duplicate') return reviewReasons(row).includes('重複刷卡')
  return true
}
