import api from './index'

export const getEmployees = (params) => api.get('/employees', { params })

export const getEmployee = (id) => api.get(`/employees/${id}`)

export const createEmployee = (data) => api.post('/employees', data)

export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data)

export const offboard = (id, data) => api.post(`/employees/${id}/offboard`, data)

export const getFinalSalaryPreview = (id, params) =>
  api.get(`/employees/${id}/final-salary-preview`, { params })

// ========== Educations ==========
export const listEmployeeEducations = (id) =>
  api.get(`/employees/${id}/educations`)

export const createEmployeeEducation = (id, data) =>
  api.post(`/employees/${id}/educations`, data)

export const updateEmployeeEducation = (id, eduId, data) =>
  api.put(`/employees/${id}/educations/${eduId}`, data)

export const deleteEmployeeEducation = (id, eduId) =>
  api.delete(`/employees/${id}/educations/${eduId}`)

// ========== Certificates ==========
export const listEmployeeCertificates = (id) =>
  api.get(`/employees/${id}/certificates`)

export const createEmployeeCertificate = (id, data) =>
  api.post(`/employees/${id}/certificates`, data)

export const updateEmployeeCertificate = (id, certId, data) =>
  api.put(`/employees/${id}/certificates/${certId}`, data)

export const deleteEmployeeCertificate = (id, certId) =>
  api.delete(`/employees/${id}/certificates/${certId}`)

// ========== Contracts ==========
export const listEmployeeContracts = (id) =>
  api.get(`/employees/${id}/contracts`)

export const createEmployeeContract = (id, data) =>
  api.post(`/employees/${id}/contracts`, data)

export const updateEmployeeContract = (id, cid, data) =>
  api.put(`/employees/${id}/contracts/${cid}`, data)

export const deleteEmployeeContract = (id, cid) =>
  api.delete(`/employees/${id}/contracts/${cid}`)
