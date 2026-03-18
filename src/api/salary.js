import api from './index'

export const calculate = (year, month) =>
  api.post(`/salaries/calculate?year=${year}&month=${month}`)

export const getFestivalBonus = (year, month) =>
  api.get(`/salaries/festival-bonus?year=${year}&month=${month}`)

export const getRecords = (year, month) =>
  api.get(`/salaries/records?year=${year}&month=${month}`)

export const getSalaryBreakdown = (recordId) =>
  api.get(`/salaries/${recordId}/breakdown`)

export const getSalaryFieldBreakdown = (recordId, field) =>
  api.get(`/salaries/${recordId}/field-breakdown?field=${field}`)

export const manualAdjustSalary = (recordId, payload) =>
  api.put(`/salaries/${recordId}/manual-adjust`, payload)

export const getHistory = (params) => api.get('/salaries/history', { params })
