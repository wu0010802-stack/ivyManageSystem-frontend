import api from './index'
import { withDedupeEscape, type ReadOptions } from '@/utils/apiDedupe'
import type { ApiQuery, AxiosResp } from './_generated/typed'

/** 排班與出勤格子（SPEC-027 §5.1）：員工 × 日期的計畫＋實際，區間含頭尾 1–31 日。 */
export const getScheduleAttendanceGrid = (
  params: ApiQuery<'/schedule-attendance/grid', 'get'>,
  opts?: ReadOptions,
): AxiosResp<'/schedule-attendance/grid', 'get'> =>
  api.get('/schedule-attendance/grid', withDedupeEscape({ params }, opts))
