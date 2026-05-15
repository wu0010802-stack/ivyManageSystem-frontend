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

// ============ Deprecated（M1 重構後不再實作；保留 stub 讓舊 view 仍能 import）============
// 舊 view 元件（CycleEventsSection / CycleSummariesSection / PenaltyCatalogPanel /
// BonusRatesPanel）仍 import 這些函式名稱。實際呼叫會回傳 410 Gone。

const _deprecated = (name) => () =>
  Promise.reject(new Error(`${name} 已於 M1 重構移除，請改用新 API`))

export const lockAppraisalCycle = _deprecated('lockAppraisalCycle')
export const unlockAppraisalCycle = _deprecated('unlockAppraisalCycle')
export const closeAppraisalCycle = _deprecated('closeAppraisalCycle')
export const bulkInitAppraisalParticipants = _deprecated('bulkInitAppraisalParticipants')
export const getAppraisalParticipant = _deprecated('getAppraisalParticipant')
export const listAppraisalEvents = _deprecated('listAppraisalEvents')
export const createAppraisalEvent = _deprecated('createAppraisalEvent')
export const patchAppraisalEvent = _deprecated('patchAppraisalEvent')
export const revertAppraisalEvent = _deprecated('revertAppraisalEvent')
export const listPenaltyCatalog = _deprecated('listPenaltyCatalog')
export const createPenaltyCatalogItem = _deprecated('createPenaltyCatalogItem')
export const patchPenaltyCatalogItem = _deprecated('patchPenaltyCatalogItem')
export const togglePenaltyCatalogItem = _deprecated('togglePenaltyCatalogItem')
export const rejectAppraisalSummary = _deprecated('rejectAppraisalSummary')
export const getAppraisalReport = _deprecated('getAppraisalReport')
export const getPenaltyLog = _deprecated('getPenaltyLog')
export const getParticipantSheet = _deprecated('getParticipantSheet')
