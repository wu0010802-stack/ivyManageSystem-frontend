import api from './index'

export const getClassrooms = () => api.get('/classrooms')

export const getClassroom = (id) => api.get(`/classrooms/${id}`)

// queryString 為 URLSearchParams.toString() 結果
export const updateClassroom = (id, queryString) =>
  api.put(`/classrooms/${id}?${queryString}`)

export const getTeachers = () => api.get('/teachers')
