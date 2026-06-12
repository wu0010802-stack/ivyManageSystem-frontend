import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

export const calculate = (year: number, month: number): AxiosResp<'/salaries/calculate', 'post'> =>
    api.post(`/salaries/calculate?year=${year}&month=${month}`)

export const getFestivalBonus = (year: number, month: number) =>
    api.get(`/salaries/festival-bonus?year=${year}&month=${month}`)

export const getFestivalBonusPeriodAccrual = (year: number, month: number) =>
    api.get(`/salaries/festival-bonus/period-accrual?year=${year}&month=${month}`)

export const getRecords = (year: number, month: number): AxiosResp<'/salaries/records', 'get'> =>
    api.get(`/salaries/records?year=${year}&month=${month}`)

export const getSalaryBreakdown = (recordId: number): AxiosResp<'/salaries/{record_id}/breakdown', 'get'> =>
    api.get(`/salaries/${recordId}/breakdown`)

export const getSalaryFieldBreakdown = (recordId: number, field: string) =>
    api.get(`/salaries/${recordId}/field-breakdown?field=${field}`)

export const manualAdjustSalary = (recordId: number, payload: ApiBody<'/salaries/{record_id}/manual-adjust', 'put'>, version?: number): AxiosResp<'/salaries/{record_id}/manual-adjust', 'put'> => {
    const config: Record<string, unknown> = {}
    if (version != null) {
        config.headers = { 'If-Match': `"${version}"` }
    }
    return api.put(`/salaries/${recordId}/manual-adjust`, payload, config)
}

export const getHistory = (params: unknown) => api.get('/salaries/history', { params })

// 銀行轉帳名冊匯出（xlsx）
// type: 'base' | 'festival' | 'surplus' | 'art_teacher'
export const exportTransferRoster = (year: number, month: number, type: string) =>
    api.get(`/salaries/${year}/${month}/transfer-roster`, {
        params: { type },
        responseType: 'blob',
    })

export const simulateSalary = (payload: ApiBody<'/salaries/simulate', 'post'>): AxiosResp<'/salaries/simulate', 'post'> =>
    api.post('/salaries/simulate', payload)

export const getSalaryLogic = () => api.get('/salaries/logic')

export const getEmployeeSalaryDebug = (params: unknown) =>
    api.get('/salaries/employee-salary-debug', { params })

export const listSalarySnapshots = (year: number, month: number, employeeId?: number) => {
    const params: Record<string, unknown> = { year, month }
    if (employeeId != null) params.employee_id = employeeId
    return api.get('/salaries/snapshots', { params })
}

export const getSalarySnapshot = (snapshotId: number) =>
    api.get(`/salaries/snapshots/${snapshotId}`)

export const createManualSnapshot = (year: number, month: number, payload: unknown = {}) =>
    api.post(`/salaries/snapshots?year=${year}&month=${month}`, payload)

export const getSnapshotDiff = (snapshotId: number) =>
    api.get(`/salaries/snapshots/${snapshotId}/diff`)

// 整月封存：非 force 時若有在職員工缺薪資紀錄、或任一筆 needs_recalc（stale）會 409；
// force=true 需 force_reason ≥ 10 字 + ACTIVITY_PAYMENT_APPROVE（財務覆核）權限，
// 被跳過的員工清單會回在 skipped_missing / skipped_stale
export interface FinalizeMonthPayload { year: number; month: number; force?: boolean; force_reason?: string }
export interface FinalizeMonthResult {
    message: string
    count: number
    finalized_by: string
    finalized_at: string
    force: boolean
    // 後端實回 {id, name} 物件清單（_find_missing_salary_employees），非姓名字串
    skipped_missing: { id: number; name: string }[]
    skipped_stale: { id: number; name: string }[]
}
export const finalizeMonth = (payload: FinalizeMonthPayload) =>
    api.post<FinalizeMonthResult>('/salaries/finalize-month', payload)

// 解除單筆薪資封存（高風險、不可逆）：
// - 需 SALARY_WRITE + admin/hr 角色 + ACTIVITY_PAYMENT_APPROVE（金流簽核）
// - reason 必填 ≥ 10 字，會寫入 record.remark + audit_summary 供日後稽核
// - 不可解除自己的薪資封存
// 失敗回傳：422（reason 太短 / 未帶 body）、403（缺權限或自我解封）、409（未封存）
export const unfinalizeSalary = (recordId: number, reason: string) =>
    api.delete(`/salaries/${recordId}/finalize`, { data: { reason } })
