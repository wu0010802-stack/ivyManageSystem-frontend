import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// titles / grade-targets / position-salary 已於後端補 response_model（契約收斂試點
// 2026-06-23），GET 讀取改接 OpenAPI 型別取代 unknown。
// 其餘端點（attendance-policy / insurance-rates / bonus）後端尚未補 response_model，
// 維持原樣待後續批次。

// ----- 職稱 -----
export const getTitles = (): AxiosResp<'/config/titles', 'get'> => api.get('/config/titles')

export const createTitle = (data: ApiBody<'/config/titles', 'post'>): AxiosResp<'/config/titles', 'post'> =>
  api.post('/config/titles', data)

// body 暫留 unknown：呼叫端 BonusConfigPanel.updateTitleGrade 以 Record<string,unknown>
// reactive state 組 payload，要 type body 需先收斂該元件 state 型別（另案）。
export const updateTitle = (id: number, data: unknown): AxiosResp<'/config/titles/{title_id}', 'put'> =>
  api.put(`/config/titles/${id}`, data)

export const deleteTitle = (id: number): AxiosResp<'/config/titles/{title_id}', 'delete'> =>
  api.delete(`/config/titles/${id}`)

// ----- 考勤規則 -----
export const getAttendancePolicy = () => api.get('/config/attendance-policy')

export const updateAttendancePolicy = (data: unknown) => api.put('/config/attendance-policy', data)

// ----- 勞健保費率 -----
export const getInsuranceRates = () => api.get('/config/insurance-rates')

export const updateInsuranceRates = (data: unknown) => api.put('/config/insurance-rates', data)

// ----- 獎金設定 -----
export const getBonusConfig = () => api.get('/config/bonus')

export const updateBonusConfig = (data: unknown) => api.put('/config/bonus', data)

export const getGradeTargets = (): AxiosResp<'/config/grade-targets', 'get'> =>
  api.get('/config/grade-targets')

// body 暫留 unknown：呼叫端以 Record<string,unknown> reactive state 組 payload（同上，另案）。
export const updateGradeTargets = (payload: unknown): AxiosResp<'/config/grade-targets', 'put'> =>
  api.put('/config/grade-targets', payload)

// ----- 職位標準底薪 -----
export const getPositionSalary = (): AxiosResp<'/config/position-salary', 'get'> =>
  api.get('/config/position-salary')

export const updatePositionSalary = (
  data: ApiBody<'/config/position-salary', 'put'>,
): AxiosResp<'/config/position-salary', 'put'> => api.put('/config/position-salary', data)

// compare 後端尚未補 response_model（回傳形狀未入契約），維持 untyped 待後端補後再 type。
export const comparePositionSalary = () => api.get('/config/position-salary/compare')

export const syncPositionSalary = (employeeIds: number[] = []) =>
  api.post('/config/position-salary/sync', { employee_ids: employeeIds })
