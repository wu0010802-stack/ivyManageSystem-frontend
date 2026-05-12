import api from './index'

// ----- 勞健保級距表（admin）-----

export const getBrackets = (year) =>
  api.get('/insurance/brackets', { params: year ? { year } : {} })

// payload: { effective_year, brackets: [...], replace_existing, reason, acknowledge_finalized_months }
export const upsertBrackets = (payload) => api.put('/insurance/brackets', payload)

// payload: { reason, acknowledge_finalized_months }
export const deleteBracket = (bracketId, payload) =>
  api.delete(`/insurance/brackets/${bracketId}`, { data: payload })

// ----- 保費試算 -----

export const calculateInsurance = (salary, dependents = 0) =>
  api.get('/insurance/calculate', { params: { salary, dependents } })

// ----- 匯入舊版表（保留） -----

export const importInsuranceTable = (payload) =>
  api.post('/insurance/import', payload)
