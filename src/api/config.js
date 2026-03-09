import api from './index'

// ----- 職稱 -----
export const getTitles = () => api.get('/config/titles')

export const createTitle = (data) => api.post('/config/titles', data)

export const updateTitle = (id, data) => api.put(`/config/titles/${id}`, data)

export const deleteTitle = (id) => api.delete(`/config/titles/${id}`)

// ----- 考勤規則 -----
export const getAttendancePolicy = () => api.get('/config/attendance-policy')

export const updateAttendancePolicy = (data) => api.put('/config/attendance-policy', data)

// ----- 勞健保費率 -----
export const getInsuranceRates = () => api.get('/config/insurance-rates')

export const updateInsuranceRates = (data) => api.put('/config/insurance-rates', data)

// ----- 獎金設定 -----
export const getBonusConfig = () => api.get('/config/bonus')

export const updateBonusConfig = (data) => api.put('/config/bonus', data)

export const getGradeTargets = () => api.get('/config/grade-targets')

export const updateGradeTargets = (payload) => api.put('/config/grade-targets', payload)
