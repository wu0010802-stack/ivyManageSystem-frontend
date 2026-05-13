import api from './index'

// ============ Cycles 考核週期 ============

export const listAppraisalCycles = (params = {}) =>
  api.get('/appraisal/cycles', { params })

// payload: { academic_year: number(民國年), semester: 'FIRST'|'SECOND', base_score_calc_date?: 'YYYY-MM-DD' }
export const createAppraisalCycle = (data) =>
  api.post('/appraisal/cycles', data)

// payload: { base_score_calc_date?: 'YYYY-MM-DD' }
export const patchAppraisalCycle = (cycleId, data) =>
  api.patch(`/appraisal/cycles/${cycleId}`, data)

export const lockAppraisalCycle = (cycleId) =>
  api.post(`/appraisal/cycles/${cycleId}/lock`)

// reason ≥ 4 字（後端強制）
export const unlockAppraisalCycle = (cycleId, reason) =>
  api.post(`/appraisal/cycles/${cycleId}/unlock`, { reason })

// 封存：要求所有 summary 已 FINALIZED；幂等
export const closeAppraisalCycle = (cycleId) =>
  api.post(`/appraisal/cycles/${cycleId}/close`)

// ============ Participants 參與者 ============

export const listAppraisalParticipants = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/participants`)

// employee_ids 不傳則帶全體在職員工
export const bulkInitAppraisalParticipants = (cycleId, employeeIds = null) =>
  api.post(`/appraisal/cycles/${cycleId}/participants:bulk_init`, {
    employee_ids: employeeIds,
  })

export const getAppraisalParticipant = (participantId) =>
  api.get(`/appraisal/participants/${participantId}`)

// payload: { role_group?, classroom_id?, base_score?, target_enrollment?, actual_enrollment? }
export const patchAppraisalParticipant = (participantId, data) =>
  api.patch(`/appraisal/participants/${participantId}`, data)

// 已產生事件的參與者不可刪（後端回 409）
export const deleteAppraisalParticipant = (participantId) =>
  api.delete(`/appraisal/participants/${participantId}`)

// ============ Events 考核事件 ============

// params: { cycle_id?, participant_id?, event_type?, limit? (≤1000，預設 200) }
export const listAppraisalEvents = (params = {}) =>
  api.get('/appraisal/events', { params })

// payload: {
//   participant_id, catalog_item_id?, event_type, event_date,
//   score_delta(-20~20), severity_level?(1-5), parent_reaction?,
//   title, detail
// }
export const createAppraisalEvent = (data) =>
  api.post('/appraisal/events', data)

export const patchAppraisalEvent = (eventId, data) =>
  api.patch(`/appraisal/events/${eventId}`, data)

// 軟作廢；reason ≥ 2 字
export const revertAppraisalEvent = (eventId, reason) =>
  api.post(`/appraisal/events/${eventId}/revert`, { reason })

// 後端 v1 回 501，UI 端先預留以利未來銜接
export const uploadAppraisalEventAttachment = (eventId, formData) =>
  api.post(`/appraisal/events/${eventId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// ============ Summaries 三階簽核 ============

// params: { cycle_id?, status? }
export const listAppraisalSummaries = (params = {}) =>
  api.get('/appraisal/summaries', { params })

export const getAppraisalSummary = (summaryId) =>
  api.get(`/appraisal/summaries/${summaryId}`)

// 重算整個 cycle 的所有 summary（已 FINALIZED 者跳過）
export const recomputeCycleSummaries = (cycleId) =>
  api.post(`/appraisal/cycles/${cycleId}/summaries:recompute`)

// payload: { comment?: string (≤500) }
export const signSupervisor = (summaryId, comment = '') =>
  api.post(`/appraisal/summaries/${summaryId}/sign_supervisor`, { comment })

export const signAccounting = (summaryId, comment = '') =>
  api.post(`/appraisal/summaries/${summaryId}/sign_accounting`, { comment })

// payload: { comment?, reason } — reason ≥ 4 字（第三階雙簽必填）
export const finalizeSummary = (summaryId, { comment = '', reason }) =>
  api.post(`/appraisal/summaries/${summaryId}/finalize`, { comment, reason })

// reason ≥ 4 字；權限依當前 stage 動態判定
export const rejectSummary = (summaryId, reason) =>
  api.post(`/appraisal/summaries/${summaryId}/reject`, { reason })

// ============ Bonus Rates 年終獎金率 ============

export const listAppraisalBonusRates = () =>
  api.get('/appraisal/bonus_rates')

// payload: { effective_from: 'YYYY-MM-DD', role_group, grade, base_amount(≥0) }
export const createAppraisalBonusRate = (data) =>
  api.post('/appraisal/bonus_rates', data)

// ============ Penalty Catalog 扣分項目目錄 ============

// params: { active_only?: bool (預設 true), category? }
export const listAppraisalPenaltyCatalog = (params = {}) =>
  api.get('/appraisal/penalty_catalog', { params })

// payload: { default_score_delta?, severity_max?(1-5), is_active?, display_order? }
export const patchAppraisalPenaltyCatalog = (itemId, data) =>
  api.patch(`/appraisal/penalty_catalog/${itemId}`, data)

// ============ Reports 報表 ============

export const getAppraisalCycleReport = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/report`)

export const downloadAppraisalCycleReportXlsx = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/report.xlsx`, { responseType: 'blob' })

export const downloadAppraisalPenaltyLogXlsx = (cycleId) =>
  api.get(`/appraisal/cycles/${cycleId}/penalty_log.xlsx`, { responseType: 'blob' })

export const downloadAppraisalParticipantSheetXlsx = (participantId) =>
  api.get(`/appraisal/participants/${participantId}/sheet.xlsx`, { responseType: 'blob' })
