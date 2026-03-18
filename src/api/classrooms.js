import api from './index'

export const getClassrooms = (params = {}) => api.get('/classrooms', { params })

export const getClassroom = (id) => api.get(`/classrooms/${id}`)

export const createClassroom = (payload) => api.post('/classrooms', payload)

export const updateClassroom = (id, payload) => api.put(`/classrooms/${id}`, payload)

export const deleteClassroom = (id) => api.delete(`/classrooms/${id}`)

export const cloneClassroomsToTerm = (payload) => api.post('/classrooms/clone-term', payload)

export const promoteAcademicYear = (payload) => api.post('/classrooms/promote-academic-year', payload)

export const getTeacherOptions = () => api.get('/classrooms/teacher-options')

export const getTeachers = getTeacherOptions

export const getGrades = () => api.get('/grades')
