import api from './index'

// ============ Year-End Cycles 年終週期 ============

export const listYearEndCycles = () => api.get('/year_end/cycles')

export const createYearEndCycle = (payload) =>
  api.post('/year_end/cycles', payload)

// ============ Org Year Settings ============

export const listOrgYearSettings = (cycleId) =>
  api.get(`/year_end/cycles/${cycleId}/org_settings`)

export const upsertOrgYearSettings = (cycleId, payload) =>
  api.post(`/year_end/cycles/${cycleId}/org_settings`, payload)

// ============ Class Enrollment Targets ============

export const listClassEnrollmentTargets = (cycleId) =>
  api.get(`/year_end/cycles/${cycleId}/class_targets`)

// ============ Settlements ============

export const listYearEndSettlements = (cycleId) =>
  api.get(`/year_end/cycles/${cycleId}/settlements`)

export const signSupervisorSettlement = (settlementId) =>
  api.post(`/year_end/settlements/${settlementId}/sign_supervisor`)

export const signAccountingSettlement = (settlementId) =>
  api.post(`/year_end/settlements/${settlementId}/sign_accounting`)

export const finalizeSettlement = (settlementId) =>
  api.post(`/year_end/settlements/${settlementId}/finalize`)

// ============ Special Bonuses ============

export const listSpecialBonuses = (cycleId, params = {}) =>
  api.get(`/year_end/cycles/${cycleId}/special_bonuses`, { params })

export const addSpecialBonus = (cycleId, payload) =>
  api.post(`/year_end/cycles/${cycleId}/special_bonuses`, payload)

// ============ Excel I/O ============

export const importYearEndExcel = (
  file,
  {
    startDate,
    endDate,
    bonusCalcDate,
    orgRateFirst = 83.6,
    orgRateSecond = 91.5,
    enrollmentTarget = 160,
  }
) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/year_end/cycles/import_excel', fd, {
    params: {
      start_date: startDate,
      end_date: endDate,
      bonus_calc_date: bonusCalcDate,
      org_achievement_rate_first: orgRateFirst,
      org_achievement_rate_second: orgRateSecond,
      enrollment_target: enrollmentTarget,
    },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const exportYearEndSummaryXlsxUrl = (cycleId) =>
  `${api.defaults.baseURL || '/api'}/year_end/cycles/${cycleId}/summary.xlsx`

export const exportYearEndTransferRosterXlsxUrl = (cycleId) =>
  `${api.defaults.baseURL || '/api'}/year_end/cycles/${cycleId}/transfer_roster.xlsx`
