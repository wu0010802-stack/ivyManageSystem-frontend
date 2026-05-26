/**
 * 補休到期與特休週年制 HR 管理 API.
 * Backend: ivy-backend/api/leave_quota_expiry.py
 */
import api from '@/api/index'
import type { AxiosResp } from './_generated/typed'

/** 列即將到期 active grant（補休 ledger） */
export function listUpcomingGrants(days = 30) {
  return api.get('/leave-quota-expiry/upcoming', { params: { days } }) as Promise<
    AxiosResp<'/leave-quota-expiry/upcoming', 'get'>
  >
}

/** 列未來 N 天滿週年員工（特休 cutover 預告） */
export function listUpcomingAnniversaries(days = 30) {
  return api.get('/leave-quota-expiry/anniversaries', { params: { days } }) as Promise<
    AxiosResp<'/leave-quota-expiry/anniversaries', 'get'>
  >
}

/** 列 unused_leave_payout_log 折算歷史 */
export function listPayoutHistory(limit = 50) {
  return api.get('/leave-quota-expiry/payout-history', { params: { limit } }) as Promise<
    AxiosResp<'/leave-quota-expiry/payout-history', 'get'>
  >
}

/** 手動 trigger scheduler（idempotent，含 try_scheduler_lock 防並發） */
export function runSchedulerNow() {
  return api.post('/leave-quota-expiry/run-now') as Promise<
    AxiosResp<'/leave-quota-expiry/run-now', 'post'>
  >
}

export interface EarliestExpiringGrant {
  expires_at: string
  unexpired_hours: number
}

/**
 * 查詢員工最早到期的 active grant（前端 LeaveQuotaManager 補休 row 用）。
 * 從 listUpcomingGrants(365) 過濾 employee_id 後取 expires_at 最小。
 */
export async function getEarliestExpiringGrantForEmployee(
  employeeId: number,
): Promise<EarliestExpiringGrant | null> {
  const res = await listUpcomingGrants(365)
  const grants = (res.data as { grants: Array<{
    employee_id: number; expires_at: string; unexpired_hours: number
  }> }).grants
  const own = grants
    .filter((g) => g.employee_id === employeeId)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
  return own[0] ?? null
}
