import api from './index'

// ----- 職稱 -----
export const getTitles = () => api.get('/config/titles')

export const createTitle = (data: unknown) => api.post('/config/titles', data)

export const updateTitle = (id: number, data: unknown) => api.put(`/config/titles/${id}`, data)

export const deleteTitle = (id: number) => api.delete(`/config/titles/${id}`)

// ----- 考勤規則 -----
export const getAttendancePolicy = () => api.get('/config/attendance-policy')

export const updateAttendancePolicy = (data: unknown) => api.put('/config/attendance-policy', data)

// ----- 勞健保費率 -----
export const getInsuranceRates = () => api.get('/config/insurance-rates')

export const updateInsuranceRates = (data: unknown) => api.put('/config/insurance-rates', data)

// ----- 獎金設定 -----
export const getBonusConfig = () => api.get('/config/bonus')

export const updateBonusConfig = (data: unknown) => api.put('/config/bonus', data)

export const getGradeTargets = () => api.get('/config/grade-targets')

export const updateGradeTargets = (payload: unknown) => api.put('/config/grade-targets', payload)

// ----- 職位標準底薪 -----
export const getPositionSalary = () => api.get('/config/position-salary')

export const updatePositionSalary = (data: unknown) => api.put('/config/position-salary', data)

export const comparePositionSalary = () => api.get('/config/position-salary/compare')

export const syncPositionSalary = (employeeIds: number[] = []) =>
  api.post('/config/position-salary/sync', { employee_ids: employeeIds })
