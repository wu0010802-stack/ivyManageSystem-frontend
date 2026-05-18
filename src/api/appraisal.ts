import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// ============ Cycles 考核週期 ============

export const listAppraisalCycles = (): AxiosResp<'/appraisal/cycles', 'get'> =>
    api.get('/appraisal/cycles')

export const createAppraisalCycle = (payload: ApiBody<'/appraisal/cycles', 'post'>): AxiosResp<'/appraisal/cycles', 'post'> =>
    api.post('/appraisal/cycles', payload)

export const patchAppraisalCycle = (cycleId: number, payload: ApiBody<'/appraisal/cycles/{cycle_id}', 'patch'>): AxiosResp<'/appraisal/cycles/{cycle_id}', 'patch'> =>
    api.patch(`/appraisal/cycles/${cycleId}`, payload)

// ============ Catalog（16 項加減分定義）============

export const listAppraisalCatalog = (): AxiosResp<'/appraisal/catalog', 'get'> =>
    api.get('/appraisal/catalog')

// ============ Participants ============

export const listAppraisalParticipants = (cycleId: number): AxiosResp<'/appraisal/cycles/{cycle_id}/participants', 'get'> =>
    api.get(`/appraisal/cycles/${cycleId}/participants`)

export const addAppraisalParticipant = (cycleId: number, payload: unknown) =>
    api.post(`/appraisal/cycles/${cycleId}/participants`, payload)

// ============ Score Items ============

export const listAppraisalScoreItems = (participantId: number) =>
    api.get(`/appraisal/participants/${participantId}/score_items`)

export const addAppraisalScoreItem = (participantId: number, payload: unknown) =>
    api.post(`/appraisal/participants/${participantId}/score_items`, payload)

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

export const exportAppraisalCycleXlsxUrl = (cycleId: number) =>
    `${api.defaults.baseURL || '/api'}/appraisal/cycles/${cycleId}/export.xlsx`

export const exportAppraisalTransferRosterXlsxUrl = (cycleId: number) =>
    `${api.defaults.baseURL || '/api'}/appraisal/cycles/${cycleId}/transfer_roster.xlsx`

// ============ Current Semester（M5 重構：當期狀態彙整）============

export const getAppraisalCurrentCycle = (params: Record<string, unknown> = {}) =>
    api.get('/appraisal/current', { params })

export const getAppraisalCyclesByYear = (academicYear: number) =>
    api.get(`/appraisal/by_year/${academicYear}`)

export const getAppraisalAggregatedStatus = (cycleId: number) =>
    api.get(`/appraisal/cycles/${cycleId}/aggregated_status`)

export const syncAppraisalScoreItems = (cycleId: number, { dryRun = false } = {}) =>
    api.post(`/appraisal/cycles/${cycleId}/sync_score_items`, null, {
        params: { dry_run: dryRun },
    })

export const getAppraisalAllEmployeesStatus = (cycleId: number) =>
    api.get(`/appraisal/cycles/${cycleId}/all_employees_status`)

export const bulkAddAppraisalParticipantsFromActive = (cycleId: number, employeeIds: number[] | null = null) =>
    api.post(`/appraisal/cycles/${cycleId}/participants:bulk_from_active`, {
        employee_ids: employeeIds,
    })

// ============ Penalty Catalog stubs（baseline build fix）============
// PenaltyCatalogPanel.vue 引用這兩個名稱，但後端目前未實作對應 endpoint；
// 在 endpoint 落地前保留 stub 讓 import / build 不失敗。
const _notImplemented = (name: string) => () =>
    Promise.reject(new Error(`${name} 後端尚未實作`))

export const listAppraisalPenaltyCatalog = _notImplemented('listAppraisalPenaltyCatalog')
export const patchAppraisalPenaltyCatalog = _notImplemented('patchAppraisalPenaltyCatalog')

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

export const getSignStatusSummary = (cycleId: number) =>
    api.get(`/appraisal/cycles/${cycleId}/sign_status_summary`)
