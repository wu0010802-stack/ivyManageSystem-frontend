import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

// 學生請假紀錄（家長申請；後端 /api/student-leaves，唯讀）
export const listStudentLeaves = (
  params: ApiQuery<'/student-leaves', 'get'> = {},
): AxiosResp<'/student-leaves', 'get'> =>
  api.get('/student-leaves', { params })
