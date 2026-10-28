import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// ============ Cycles 考核週期 ============

export const listAppraisalCycles = (): AxiosResp<'/appraisal/cycles', 'get'> =>
    api.get('/appraisal/cycles')

export const createAppraisalCycle = (payload: ApiBody<'/appraisal/cycles', 'post'>): AxiosResp<'/appraisal/cycles', 'post'> =>
    api.post('/appraisal/cycles', payload)

export const patchAppraisalCycle = (cycleId: number, payload: ApiBody<'/appraisal/cycles/{cycle_id}', 'patch'>): AxiosResp<'/appraisal/cycles/{cycle_id}', 'patch'> =>
    api.patch(`/appraisal/cycles/${cycleId}`, payload)

/**
 * 標記該週期考核獎金「已另循名冊發放」（APPRAISAL_ACCOUNTING；僅 CLOSED 週期，重複標記 409）。
 * 標記後年終考核 payout 不再為該半年產生明細。note 選填，空白不送。
 */
export const markAppraisalCycleRosterPaid = (cycleId: number, note?: string): AxiosResp<'/appraisal/cycles/{cycle_id}/roster-paid', 'post'> => {
    const trimmed = note?.trim()
    return api.post(`/appraisal/cycles/${cycleId}/roster-paid`, trimmed ? { note: trimmed } : {})
}

/** 取消已發放標記（標錯時還原）；尚未標記回 409。 */
export const unmarkAppraisalCycleRosterPaid = (cycleId: number): AxiosResp<'/appraisal/cycles/{cycle_id}/roster-paid', 'delete'> =>
    api.delete(`/appraisal/cycles/${cycleId}/roster-paid`)

// ============ Catalog（16 項加減分定義）============

export const listAppraisalCatalog = (): AxiosResp<'/appraisal/catalog', 'get'> =>
    api.get('/appraisal/catalog')

export const patchAppraisalCatalogItem = (itemId: number, payload: ApiBody<'/appraisal/catalog/{item_id}', 'patch'>): AxiosResp<'/appraisal/catalog/{item_id}', 'patch'> =>
    api.patch(`/appraisal/catalog/${itemId}`, payload)

// ============ Participants ============

export const listAppraisalParticipants = (cycleId: number): AxiosResp<'/appraisal/cycles/{cycle_id}/participants', 'get'> =>
    api.get(`/appraisal/cycles/${cycleId}/participants`)

export const addAppraisalParticipant = (cycleId: number, payload: unknown) =>
    api.post(`/appraisal/cycles/${cycleId}/participants`, payload)

// ============ Summaries ============

export const listAppraisalSummaries = (cycleId: number) =>
    api.get(`/appraisal/cycles/${cycleId}/summaries`)

export const recomputeAppraisalSummaries = (cycleId: number) =>
    api.post(`/appraisal/cycles/${cycleId}/summaries:recompute`)

export const signSupervisorAppraisalSummary = (summaryId: number, comment = '') =>
    api.post(`/appraisal/summaries/${summaryId}/sign_supervisor`, null, {
        params: { comment },
    })

export const signAccountingAppraisalSummary = (summaryId: number, comment = '') =>
    api.post(`/appraisal/summaries/${summaryId}/sign_accounting`, null, {
        params: { comment },
    })

export const finalizeAppraisalSummary = (summaryId: number, comment = '') =>
    api.post(`/appraisal/summaries/${summaryId}/finalize`, null, {
        params: { comment },
    })

// ============ Bonus Rates ============

export const listAppraisalBonusRates = () =>
    api.get('/appraisal/bonus_rates')

export const createAppraisalBonusRate = (payload: unknown) =>
    api.post('/appraisal/bonus_rates', payload)

// ============ Excel I/O ============

export const importAppraisalExcel = (file: File, { startDate, endDate, baseScoreCalcDate }: { startDate: string; endDate: string; baseScoreCalcDate: string }) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/appraisal/cycles/import_excel', fd, {
        params: {
            start_date: startDate,
            end_date: endDate,
            base_score_calc_date: baseScoreCalcDate,
        },
        headers: { 'Content-Type': 'multipart/form-data' },
    })
}

// 考核表匯出路徑：交給 @/utils/download 的 downloadFile（原為帶 baseURL 的 <a href> 直連，
// 後端回錯時只會下載到 JSON 錯誤頁）。
export const appraisalCycleXlsxPath = (cycleId: number) =>
    `/appraisal/cycles/${cycleId}/export.xlsx`

// 轉帳名冊下載改走 @/utils/transferRoster（axios 下載才讀得到 X-Roster-Excluded-Count）

// ============ Current Semester（M5 重構：當期狀態彙整）============

export const getAppraisalCurrentCycle = (params: Record<string, unknown> = {}): AxiosResp<'/appraisal/current', 'get'> =>
    api.get('/appraisal/current', { params })

export const getAppraisalCyclesByYear = (academicYear: number) =>
    api.get(`/appraisal/by_year/${academicYear}`)

/** UX 批次 D：等第分布校準（本期/上期分布＋逐員工上期對齊，唯讀彙總）。 */
export const getGradeDistribution = (
  cycleId: number,
): AxiosResp<'/appraisal/cycles/{cycle_id}/grade_distribution', 'get'> =>
  api.get(`/appraisal/cycles/${cycleId}/grade_distribution`)

export const syncAppraisalScoreItems = (cycleId: number, { dryRun = false } = {}) =>
    api.post(`/appraisal/cycles/${cycleId}/sync_score_items`, null, {
        params: { dry_run: dryRun },
    })

export const getAppraisalAllEmployeesStatus = (cycleId: number) =>
    api.get(`/appraisal/cycles/${cycleId}/all_employees_status`)

/** 進頁即算：單一 transaction 內 sync_score_items + summaries:recompute，回摘要計數。僅 OPEN cycle 可呼叫（非 OPEN 後端回 400）。 */
export const refreshAppraisalCycle = (cycleId: number): AxiosResp<'/appraisal/cycles/{cycle_id}/refresh', 'post'> =>
    api.post(`/appraisal/cycles/${cycleId}/refresh`)

export const bulkAddAppraisalParticipantsFromActive = (cycleId: number, employeeIds: number[] | null = null) =>
    api.post(`/appraisal/cycles/${cycleId}/participants:bulk_from_active`, {
        employee_ids: employeeIds,
    })

// ============ Phase 1 Calibrate（scoring rules + manual counts + preview）============

export const listScoringRules = (effective_on: string) =>
    api.get('/appraisal/scoring_rules', { params: { effective_on } })

export const getScoringRuleHistory = (item_code: string) =>
    api.get('/appraisal/scoring_rules/history', { params: { item_code } })

export const createScoringRule = (payload: unknown) =>
    api.post('/appraisal/scoring_rules', payload)

export const getManualEventCounts = (cycleId: number) =>
    api.get(`/appraisal/cycles/${cycleId}/manual_event_counts`)

export const batchUpsertManualEventCounts = (cycleId: number, entries: unknown) =>
    api.put(`/appraisal/cycles/${cycleId}/manual_event_counts:batch`, { entries })

export const previewAppraisalScore = (cycleId: number) =>
    api.post(`/appraisal/cycles/${cycleId}/score_preview`)

// ============ Phase 2 Signing UX（reject / comment / batch_sign / logs / status_summary）============

export const rejectSummary = (summaryId: number, payload: unknown) =>
    api.post(`/appraisal/summaries/${summaryId}/reject`, payload)

export const commentSummary = (summaryId: number, comment: string) =>
    api.post(`/appraisal/summaries/${summaryId}/comment`, { comment })

export const batchSignSummaries = (cycleId: number, summary_ids: number[], stage: string) =>
    api.post(`/appraisal/cycles/${cycleId}/summaries:batch_sign`, { summary_ids, stage })

export const getSummaryLogs = (summaryId: number) =>
    api.get(`/appraisal/summaries/${summaryId}/logs`)

export const getSignStatusSummary = (cycleId: number): AxiosResp<'/appraisal/cycles/{cycle_id}/sign_status_summary', 'get'> =>
    api.get(`/appraisal/cycles/${cycleId}/sign_status_summary`)

// ============ Exception Center（例外中心：唯讀彙整待人工處理事項）============

/** 彙整考核週期內待人工處理的例外事項（唯讀衍生，不建新表）。 */
export const getAppraisalCycleExceptions = (
    cycleId: number,
): AxiosResp<'/appraisal/cycles/{cycle_id}/exceptions', 'get'> =>
    api.get(`/appraisal/cycles/${cycleId}/exceptions`)
