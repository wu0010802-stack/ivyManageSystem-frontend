import api from './index'

// 月度固定費用（admin 手動登錄）— 8 category × 12 月 = 96 cells
// 後端契約：models/monthly_fixed_cost.py + api/monthly_fixed_costs.py
// 注意：axios baseURL 已含 /api，wrapper 路徑不要重複加 /api 前綴。

// 後端回 {year, items: [...]}（api/monthly_fixed_costs.py），統一解包為陣列供
// MonthlyFixedCostPanel / OverviewPanel 消費；防禦性保留裸陣列 passthrough。
// ⚠ 2026-07-05 稽核修正：舊版直接回 r.data（物件），下游 Array.isArray 恆 false，
// 既有已存值永遠載不進 grid（見 tests/unit/api/monthlyFixedCost.test.js）。
export const getMonthlyFixedCosts = (year: number) =>
  api.get('/monthly-fixed-costs', { params: { year } }).then(r =>
    Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
  )

export const upsertMonthlyFixedCost = (payload: unknown) =>
  api.put('/monthly-fixed-costs', payload).then(r => r.data)

export const batchUpsertMonthlyFixedCosts = (year: number, entries: unknown) =>
  api.put('/monthly-fixed-costs/batch', { year, entries }).then(r => r.data)

export const deleteMonthlyFixedCost = (id: number) =>
  api.delete(`/monthly-fixed-costs/${id}`).then(r => r.data)
