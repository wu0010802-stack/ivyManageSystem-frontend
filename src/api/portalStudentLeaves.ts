/**
 * 教師端 Portal 學生請假查詢（對應 api/portal/student_leaves.py）。
 *
 * 不可改用管理端的 src/api/studentLeaves.ts：該端點掛 require_staff_permission，
 * 對 role === 'teacher' 一律 403。
 */
import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

export const listPortalStudentLeaves = (
  params: ApiQuery<'/portal/student-leaves', 'get'> = {},
): AxiosResp<'/portal/student-leaves', 'get'> =>
  api.get('/portal/student-leaves', { params })
