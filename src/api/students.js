import api from './index'

export const getStudents = (params) => api.get('/students', { params })

export const createStudent = (data) => api.post('/students', data)

export const updateStudent = (id, data) => api.put(`/students/${id}`, data)
