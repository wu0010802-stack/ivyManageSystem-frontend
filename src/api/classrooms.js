import api from './index'

export const getClassrooms = (params = {}) => api.get('/classrooms', { params })

export const getClassroom = (id) => api.get(`/classrooms/${id}`)

export const createClassroom = (payload) => api.post('/classrooms', payload)

export const updateClassroom = (id, payload) => api.put(`/classrooms/${id}`, payload)

export const deleteClassroom = (id) => api.delete(`/classrooms/${id}`)

export const getTeacherOptions = () => api.get('/classrooms/teacher-options')

export const getTeachers = getTeacherOptions

export const getGrades = () => api.get('/grades')
