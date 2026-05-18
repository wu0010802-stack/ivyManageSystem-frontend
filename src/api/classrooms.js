import api from './index'

/**
 * Typed API surface for classrooms (班級管理).
 *
 * @typedef {import('./_generated/typed').ApiQuery<'/classrooms', 'get'>}                            ClassroomsQuery
 * @typedef {import('./_generated/typed').AxiosResp<'/classrooms', 'get'>}                          GetClassroomsResp
 * @typedef {import('./_generated/typed').AxiosResp<'/classrooms/{classroom_id}', 'get'>}            GetClassroomResp
 * @typedef {import('./_generated/typed').ApiBody<'/classrooms', 'post'>}                            ClassroomCreatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/classrooms', 'post'>}                         CreateClassroomResp
 * @typedef {import('./_generated/typed').ApiBody<'/classrooms/{classroom_id}', 'put'>}              ClassroomUpdatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/classrooms/{classroom_id}', 'put'>}           UpdateClassroomResp
 * @typedef {import('./_generated/typed').AxiosResp<'/classrooms/{classroom_id}', 'delete'>}         DeleteClassroomResp
 */

/**
 * @param {ClassroomsQuery} [params]
 * @returns {GetClassroomsResp}
 */
export const getClassrooms = (params = {}) => api.get('/classrooms', { params })

/**
 * @param {number} id
 * @returns {GetClassroomResp}
 */
export const getClassroom = (id) => api.get(`/classrooms/${id}`)

/**
 * @param {ClassroomCreatePayload} payload
 * @returns {CreateClassroomResp}
 */
export const createClassroom = (payload) => api.post('/classrooms', payload)

/**
 * @param {number} id
 * @param {ClassroomUpdatePayload} payload
 * @returns {UpdateClassroomResp}
 */
export const updateClassroom = (id, payload) => api.put(`/classrooms/${id}`, payload)

/**
 * @param {number} id
 * @returns {DeleteClassroomResp}
 */
export const deleteClassroom = (id) => api.delete(`/classrooms/${id}`)

export const cloneClassroomsToTerm = (payload) => api.post('/classrooms/clone-term', payload)

export const promoteAcademicYear = (payload) => api.post('/classrooms/promote-academic-year', payload)

export const getTeacherOptions = () => api.get('/classrooms/teacher-options')

export const getTeachers = getTeacherOptions

export const getGrades = () => api.get('/grades')

export const updateGrade = (id, payload) => api.patch(`/grades/${id}`, payload)

export const getClassroomEnrollmentComposition = (id) =>
  api.get(`/classrooms/${id}/enrollment-composition`)
