import api from './index'

export const calculate = (year, month) =>
  api.post(`/salaries/calculate?year=${year}&month=${month}`)

export const getFestivalBonus = (year, month) =>
  api.get(`/salaries/festival-bonus?year=${year}&month=${month}`)

export const getFestivalBonusPeriodAccrual = (year, month) =>
  api.get(`/salaries/festival-bonus/period-accrual?year=${year}&month=${month}`)

export const getRecords = (year, month) =>
  api.get(`/salaries/records?year=${year}&month=${month}`)

export const getSalaryBreakdown = (recordId) =>
  api.get(`/salaries/${recordId}/breakdown`)

export const getSalaryFieldBreakdown = (recordId, field) =>
  api.get(`/salaries/${recordId}/field-breakdown?field=${field}`)

export const manualAdjustSalary = (recordId, payload, version) => {
  const config = {}
  if (version != null) {
    config.headers = { 'If-Match': `"${version}"` }
  }
  return api.put(`/salaries/${recordId}/manual-adjust`, payload, config)
}

export const getHistory = (params) => api.get('/salaries/history', { params })

export const simulateSalary = (payload) => api.post('/salaries/simulate', payload)

export const listSalarySnapshots = (year, month, employeeId) => {
  const params = { year, month }
  if (employeeId != null) params.employee_id = employeeId
  return api.get('/salaries/snapshots', { params })
}

export const getSalarySnapshot = (snapshotId) =>
  api.get(`/salaries/snapshots/${snapshotId}`)

export const createManualSnapshot = (year, month, payload = {}) =>
  api.post(`/salaries/snapshots?year=${year}&month=${month}`, payload)

export const getSnapshotDiff = (snapshotId) =>
  api.get(`/salaries/snapshots/${snapshotId}/diff`)
