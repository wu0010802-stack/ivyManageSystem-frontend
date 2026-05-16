import api from './index'

// ============ Cycles 考核週期 ============

export const listAppraisalCycles = () => api.get('/appraisal/cycles')

export const createAppraisalCycle = (payload) =>
  api.post('/appraisal/cycles', payload)

export const patchAppraisalCycle = (cycleId, payload) =>
  api.patch(`/appraisal/cycles/${cycleId}`, payload)

// ============ Catalog（16 項加減分定義）============

export const listAppraisalCatalog = () => api.get('/appraisal/catalog')

// ============ Participants ============

export const listAppraisalParticipants = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/participants`)

export const addAppraisalParticipant = (cycleId, payload) =>
  api.post(`/appraisal/cycles/${cycleId}/participants`, payload)

// ============ Score Items ============

export const listAppraisalScoreItems = (participantId) =>
  api.get(`/appraisal/participants/${participantId}/score_items`)

export const addAppraisalScoreItem = (participantId, payload) =>
  api.post(`/appraisal/participants/${participantId}/score_items`, payload)

// ============ Summaries ============

export const listAppraisalSummaries = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/summaries`)

export const recomputeAppraisalSummaries = (cycleId) =>
  api.post(`/appraisal/cycles/${cycleId}/summaries:recompute`)

export const signSupervisorAppraisalSummary = (summaryId, comment = '') =>
  api.post(`/appraisal/summaries/${summaryId}/sign_supervisor`, null, {
    params: { comment },
  })

export const signAccountingAppraisalSummary = (summaryId, comment = '') =>
  api.post(`/appraisal/summaries/${summaryId}/sign_accounting`, null, {
    params: { comment },
  })

export const finalizeAppraisalSummary = (summaryId, comment = '') =>
  api.post(`/appraisal/summaries/${summaryId}/finalize`, null, {
    params: { comment },
  })

// ============ Bonus Rates ============

export const listAppraisalBonusRates = () =>
  api.get('/appraisal/bonus_rates')

export const createAppraisalBonusRate = (payload) =>
  api.post('/appraisal/bonus_rates', payload)

// ============ Excel I/O ============

export const importAppraisalExcel = (file, { startDate, endDate, baseScoreCalcDate }) => {
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

export const exportAppraisalCycleXlsxUrl = (cycleId) =>
  `${api.defaults.baseURL || '/api'}/appraisal/cycles/${cycleId}/export.xlsx`

export const exportAppraisalTransferRosterXlsxUrl = (cycleId) =>
  `${api.defaults.baseURL || '/api'}/appraisal/cycles/${cycleId}/transfer_roster.xlsx`

// ============ Current Semester（M5 重構：當期狀態彙整）============

export const getAppraisalCurrentCycle = (params = {}) =>
  api.get('/appraisal/current', { params })

export const getAppraisalCyclesByYear = (academicYear) =>
  api.get(`/appraisal/by_year/${academicYear}`)

export const getAppraisalAggregatedStatus = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/aggregated_status`)

export const syncAppraisalScoreItems = (cycleId, { dryRun = false } = {}) =>
  api.post(`/appraisal/cycles/${cycleId}/sync_score_items`, null, {
    params: { dry_run: dryRun },
  })

// ============ Penalty Catalog stubs（baseline build fix）============
// PenaltyCatalogPanel.vue 引用這兩個名稱，但後端目前未實作對應 endpoint；
// 在 endpoint 落地前保留 stub 讓 import / build 不失敗。
const _notImplemented = (name) => () =>
  Promise.reject(new Error(`${name} 後端尚未實作`))

export const listAppraisalPenaltyCatalog = _notImplemented('listAppraisalPenaltyCatalog')
export const patchAppraisalPenaltyCatalog = _notImplemented('patchAppraisalPenaltyCatalog')

