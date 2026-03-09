import api from './index'

export const getEmployees = () => api.get('/employees')

export const getEmployee = (id) => api.get(`/employees/${id}`)

export const createEmployee = (data) => api.post('/employees', data)

export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data)

export const offboard = (id, data) => api.post(`/employees/${id}/offboard`, data)

export const getFinalSalaryPreview = (id, params) =>
  api.get(`/employees/${id}/final-salary-preview`, { params })
