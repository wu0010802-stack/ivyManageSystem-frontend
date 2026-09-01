import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export const getEnrollmentStats = (params: unknown) => api.get('/student-enrollment/stats', { params })
export const getEnrollmentOptions = () => api.get('/student-enrollment/options')
export const getEnrollmentRoster = (params: unknown) => api.get('/student-enrollment/roster', { params })
export const getEnrollmentRosterPdf = (params: unknown) =>
  api.get('/student-enrollment/roster.pdf', { params, responseType: 'blob' })

// 在籍人數快照（SPEC-017）：headcount-on 為節慶未來用，本次不加 wrapper。
export const getHeadcountHistory = (
  params?: ApiQuery<'/student-enrollment/headcount-history', 'get'>,
): AxiosResp<'/student-enrollment/headcount-history', 'get'> =>
  api.get('/student-enrollment/headcount-history', { params })

export const getHeadcountChanges = (
  params: ApiQuery<'/student-enrollment/headcount-changes', 'get'>,
): AxiosResp<'/student-enrollment/headcount-changes', 'get'> =>
  api.get('/student-enrollment/headcount-changes', { params })

export const getSnapshotMembers = (
  params: ApiQuery<'/student-enrollment/snapshot-members', 'get'>,
): AxiosResp<'/student-enrollment/snapshot-members', 'get'> =>
  api.get('/student-enrollment/snapshot-members', { params })

export const createHeadcountSnapshot = (
  data: ApiBody<'/student-enrollment/headcount-snapshots', 'post'>,
): AxiosResp<'/student-enrollment/headcount-snapshots', 'post'> =>
  api.post('/student-enrollment/headcount-snapshots', data)
