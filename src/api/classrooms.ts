import api from './index'
import type { ApiQuery, ApiBody, AxiosResp } from './_generated/typed'

export const getClassrooms = (params: ApiQuery<'/classrooms', 'get'> = {}): AxiosResp<'/classrooms', 'get'> =>
    api.get('/classrooms', { params })

export const getClassroom = (id: number): AxiosResp<'/classrooms/{classroom_id}', 'get'> =>
    api.get(`/classrooms/${id}`)

export const createClassroom = (payload: ApiBody<'/classrooms', 'post'>): AxiosResp<'/classrooms', 'post'> =>
    api.post('/classrooms', payload)

export const updateClassroom = (id: number, payload: ApiBody<'/classrooms/{classroom_id}', 'put'>): AxiosResp<'/classrooms/{classroom_id}', 'put'> =>
    api.put(`/classrooms/${id}`, payload)

export const deleteClassroom = (id: number): AxiosResp<'/classrooms/{classroom_id}', 'delete'> =>
    api.delete(`/classrooms/${id}`)

export const cloneClassroomsToTerm = (payload: unknown) => api.post('/classrooms/clone-term', payload)

export const promoteAcademicYear = (payload: unknown) => api.post('/classrooms/promote-academic-year', payload)

export const getTeacherOptions = () => api.get('/classrooms/teacher-options')

export const getTeachers = getTeacherOptions

export const getGrades = () => api.get('/grades')

export const updateGrade = (id: number, payload: unknown) => api.patch(`/grades/${id}`, payload)

export const getClassroomEnrollmentComposition = (id: number) =>
    api.get(`/classrooms/${id}/enrollment-composition`)
