/**
 * 代理接手職務（SPEC-026 §4.2）的後端警示格式化。
 *
 * 核准、駁回或刪除假單本身已經完成；後端把「代理人那天已有調班／已有出勤／薪資封存月……」
 * 這類例外以 substitute_duty_warnings 回傳，這裡轉成給行政人員看的一行文字。
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null

export function formatSubstituteDutyWarning(warning: unknown): string {
  const rec = asRecord(warning)
  if (!rec || typeof rec.message !== 'string' || rec.message.length === 0) return ''
  const leaveId = typeof rec.leave_id === 'number' ? `假單 #${rec.leave_id}` : ''
  const date = typeof rec.date === 'string' && rec.date.length > 0 ? `（${rec.date}）` : ''
  return `【代理接手職務】${leaveId}${date}：${rec.message}`
}

/** 從 axios 回應（`res.data.substitute_duty_warnings`）取出並格式化；欄位不存在或格式不對一律回空陣列。 */
export function extractSubstituteDutyWarnings(res: unknown): string[] {
  const data = asRecord(asRecord(res)?.data)
  const list = data?.substitute_duty_warnings
  if (!Array.isArray(list)) return []
  return list.map(formatSubstituteDutyWarning).filter((text) => text.length > 0)
}
