import api from './index'
import type { ApiBody, ApiQuery, ApiResponse, AxiosResp } from './_generated/typed'

// useSnapshot=false：「改用現行主檔重算」——曾封存列忽略輸入快照、全走現值；
// 後端要求 reason ≥10 字並寫入審計（422 擋無原因）
export const calculate = (
    year: number, month: number, useSnapshot = true, reason?: string,
): AxiosResp<'/salaries/calculate', 'post'> =>
    api.post(
        `/salaries/calculate?year=${year}&month=${month}&use_snapshot=${useSnapshot}`
        + (reason ? `&reason=${encodeURIComponent(reason)}` : ''),
    )

// async 批次計算（後端 calculate-async + job registry）；輪詢型別直接取 OpenAPI，
// 避免 registry 回應增減欄位後手寫 interface 漂移。
export type SalaryCalcJobStatus = ApiResponse<'/salaries/calculate-jobs/{job_id}', 'get'>

/** 啟動 async 批次計算 job（202，立即回 job_id；實際計算於背景）。409=同月已有進行中 job/已封存。
 *  useSnapshot=false：「改用現行主檔重算」——曾封存列忽略輸入快照、全走現值；
 *  後端要求 reason ≥10 字並寫入審計（422 擋無原因）。 */
export const calculateAsync = (
    year: number, month: number, useSnapshot = true, reason?: string,
): AxiosResp<'/salaries/calculate-async', 'post'> =>
    api.post(
        `/salaries/calculate-async?year=${year}&month=${month}&use_snapshot=${useSnapshot}`
        + (reason ? `&reason=${encodeURIComponent(reason)}` : ''),
    )

/** 查詢 async 計算 job 狀態 / 進度（輪詢用）。 */
export const getSalaryCalcJob = (jobId: string): AxiosResp<'/salaries/calculate-jobs/{job_id}', 'get'> =>
    api.get(`/salaries/calculate-jobs/${jobId}`)

export const getFestivalBonus = (year: number, month: number) =>
    api.get(`/salaries/festival-bonus?year=${year}&month=${month}`)

export const getFestivalBonusPeriodAccrual = (year: number, month: number) =>
    api.get(`/salaries/festival-bonus/period-accrual?year=${year}&month=${month}`)

// 節慶人數月底結算（2026-08-20；程式沿用 enrollment snapshot 命名，UI 稱「節慶人數」）
// 產生 → HR 核對 → 必要時人工調整 → 確認本月 → 薪資/年終/考核共用同一份人數。
export const getEnrollmentSnapshot = (
    year: number,
    month: number,
): AxiosResp<'/salaries/enrollment-snapshot', 'get'> =>
    api.get(`/salaries/enrollment-snapshot?year=${year}&month=${month}`)

export const generateEnrollmentSnapshot = (
    payload: ApiBody<'/salaries/enrollment-snapshot/generate', 'post'>,
): AxiosResp<'/salaries/enrollment-snapshot/generate', 'post'> =>
    api.post('/salaries/enrollment-snapshot/generate', payload)

export const patchEnrollmentSnapshot = (
    id: number,
    payload: ApiBody<'/salaries/enrollment-snapshot/{snapshot_id}', 'patch'>,
): AxiosResp<'/salaries/enrollment-snapshot/{snapshot_id}', 'patch'> =>
    api.patch(`/salaries/enrollment-snapshot/${id}`, payload)

export const confirmEnrollmentSnapshot = (
    payload: ApiBody<'/salaries/enrollment-snapshot/confirm', 'post'>,
): AxiosResp<'/salaries/enrollment-snapshot/confirm', 'post'> =>
    api.post('/salaries/enrollment-snapshot/confirm', payload)

/** 重開已確認月份（需 ≥10 字原因）——唯一能覆寫已確認人數的途徑。 */
export const reopenEnrollmentSnapshot = (
    payload: ApiBody<'/salaries/enrollment-snapshot/reopen', 'post'>,
): AxiosResp<'/salaries/enrollment-snapshot/reopen', 'post'> =>
    api.post('/salaries/enrollment-snapshot/reopen', payload)

/** 排除明細（長假／休學）；後端只回 student_id 與學號，不回姓名。 */
export const getEnrollmentSnapshotExclusions = (
    id: number,
): AxiosResp<'/salaries/enrollment-snapshot/{snapshot_id}/exclusions', 'get'> =>
    api.get(`/salaries/enrollment-snapshot/${id}/exclusions`)

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

export const getHistory = (
    params: ApiQuery<'/salaries/history', 'get'>,
): AxiosResp<'/salaries/history', 'get'> => api.get('/salaries/history', { params })

// 全員月總覽（persisted 純彙總；summary 由後端對帳，前端不得重加總）。
// signal 供年月快速切換時 abort 舊請求（配合呼叫端 epoch race guard）。
export const getSalaryMonthlyOverview = (
    params: ApiQuery<'/salaries/monthly-overview', 'get'>,
    signal?: AbortSignal,
): AxiosResp<'/salaries/monthly-overview', 'get'> =>
    api.get('/salaries/monthly-overview', { params, signal })

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
export type FinalizeMonthPayload = ApiBody<'/salaries/finalize-month', 'post'>
export type FinalizeMonthResult = ApiResponse<'/salaries/finalize-month', 'post'>
export const finalizeMonth = (payload: FinalizeMonthPayload): AxiosResp<'/salaries/finalize-month', 'post'> =>
    api.post('/salaries/finalize-month', payload)

// 解除單筆薪資封存（高風險、不可逆）：
// - 需 SALARY_WRITE + admin/hr 角色 + ACTIVITY_PAYMENT_APPROVE（金流簽核）
// - reason 必填 ≥ 10 字，會寫入 record.remark + audit_summary 供日後稽核
// - 不可解除自己的薪資封存
// 失敗回傳：422（reason 太短 / 未帶 body）、403（缺權限或自我解封）、409（未封存）
export const unfinalizeSalary = (recordId: number, reason: string): AxiosResp<'/salaries/{record_id}/finalize', 'delete'> => {
    const payload: ApiBody<'/salaries/{record_id}/finalize', 'delete'> = { reason }
    return api.delete(`/salaries/${recordId}/finalize`, { data: payload })
}
