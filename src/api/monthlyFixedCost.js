import api from './index'

// 月度固定費用（admin 手動登錄）— 8 category × 12 月 = 96 cells
// 後端契約：models/monthly_fixed_cost.py + api/monthly_fixed_costs.py
// 注意：axios baseURL 已含 /api，wrapper 路徑不要重複加 /api 前綴。

export const getMonthlyFixedCosts = (year) =>
  api.get('/monthly-fixed-costs', { params: { year } }).then(r => r.data)

export const upsertMonthlyFixedCost = (payload) =>
  api.put('/monthly-fixed-costs', payload).then(r => r.data)

export const batchUpsertMonthlyFixedCosts = (year, entries) =>
  api.put('/monthly-fixed-costs/batch', { year, entries }).then(r => r.data)

export const deleteMonthlyFixedCost = (id) =>
  api.delete(`/monthly-fixed-costs/${id}`).then(r => r.data)
