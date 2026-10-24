/**
 * 請假頁「帶人帶日期新增假單」深連結：排班與出勤的疑似缺勤抽屜連過去，請假頁開頁即開新增對話框並帶入。
 * 組連結與解析放在一起，兩端格式不會各寫各的。
 */
import type { LocationQuery, LocationQueryValue } from 'vue-router'

const KEYS = ['create', 'employee_id', 'date'] as const

export function leaveCreateLink(employeeId: number, date: string): { path: string; query: Record<(typeof KEYS)[number], string> } {
  return { path: '/leaves', query: { create: '1', employee_id: String(employeeId), date } }
}

const first = (value: LocationQueryValue | LocationQueryValue[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null

export function parseLeaveCreateQuery(query: LocationQuery | undefined): { employeeId: number; date: string } | null {
  if (!query || first(query.create) !== '1') return null
  const employeeId = Number(first(query.employee_id))
  const date = first(query.date)
  if (!Number.isInteger(employeeId) || employeeId <= 0) return null
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { employeeId, date }
}

/** 開完對話框後拿掉深連結參數（重新整理不再開一次），其他參數保留 */
export function stripLeaveCreateQuery(query: LocationQuery): LocationQuery {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !(KEYS as readonly string[]).includes(key)))
}
