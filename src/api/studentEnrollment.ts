import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

export const getEnrollmentStats = (params: unknown) => api.get('/student-enrollment/stats', { params })
export const getEnrollmentOptions = () => api.get('/student-enrollment/options')
export const getEnrollmentRoster = (params: unknown) => api.get('/student-enrollment/roster', { params })
export const getEnrollmentRosterPdf = (params: unknown) =>
  api.get('/student-enrollment/roster.pdf', { params, responseType: 'blob' })

// 在籍異動帳（SPEC-021）。取代 SPEC-017 的快照四支 wrapper。
// ⚠ 帳只由後端業務路徑自動產生，前端**沒有、也不得有**任何寫入 wrapper——
// 人工補登會讓「憑證」失去意義（與 studentChangeLogs 可手動補登的性質相反）。
export const getEnrollmentLedger = (
  params: ApiQuery<'/student-enrollment/ledger', 'get'>,
): AxiosResp<'/student-enrollment/ledger', 'get'> =>
  api.get('/student-enrollment/ledger', { params })

export const getLedgerReconcile = (
  params: ApiQuery<'/student-enrollment/ledger/reconcile', 'get'>,
): AxiosResp<'/student-enrollment/ledger/reconcile', 'get'> =>
  api.get('/student-enrollment/ledger/reconcile', { params })

export const getLedgerTrend = (
  params: ApiQuery<'/student-enrollment/ledger/trend', 'get'>,
): AxiosResp<'/student-enrollment/ledger/trend', 'get'> =>
  api.get('/student-enrollment/ledger/trend', { params })

export const getHeadcountOn = (
  params: ApiQuery<'/student-enrollment/headcount-on', 'get'>,
): AxiosResp<'/student-enrollment/headcount-on', 'get'> =>
  api.get('/student-enrollment/headcount-on', { params })
