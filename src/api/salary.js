import api from './index'

export const calculate = (year, month) =>
  api.post(`/salaries/calculate?year=${year}&month=${month}`)

export const getFestivalBonus = (year, month) =>
  api.get(`/salaries/festival-bonus?year=${year}&month=${month}`)

export const getRecords = (year, month) =>
  api.get(`/salaries/records?year=${year}&month=${month}`)

export const getHistory = (params) => api.get('/salaries/history', { params })
