import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

/** 排班與出勤格子（SPEC-027 §5.1）：員工 × 日期的計畫＋實際，區間含頭尾 1–31 日。 */
export const getScheduleAttendanceGrid = (
  params: ApiQuery<'/schedule-attendance/grid', 'get'>,
): AxiosResp<'/schedule-attendance/grid', 'get'> =>
  api.get('/schedule-attendance/grid', { params })
