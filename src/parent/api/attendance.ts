import type { AxiosResp, Schema } from '@/api/_generated/typed'
import api from './index'

/** 後端 `api/parent_portal/attendance.py` 已掛 response_model，型別一律取自 schema.d.ts。 */
export type ParentMonthlyAttendance = Schema<'ParentMonthlyAttendanceOut'>
export type ParentAttendanceDay = Schema<'ParentAttendanceDayOut'>

export const getMonthlyAttendance = (
  studentId: number,
  year: number,
  month: number,
  config: unknown = {},
): AxiosResp<'/parent/attendance/monthly', 'get'> =>
  api.get('/parent/attendance/monthly', {
    params: { student_id: studentId, year, month },
    ...(config as object),
  })
