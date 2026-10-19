import api from './index'
import { withDedupeEscape, type ReadOptions } from '@/utils/apiDedupe'
import type { ApiQuery, AxiosResp } from './_generated/typed'

/** 取得所選月份任職名冊與指定員工的應出勤日、核准請假摘要。 */
export const getAttendanceMonthContext = (
  params: ApiQuery<'/attendance/month-context', 'get'>,
  opts?: ReadOptions,
): AxiosResp<'/attendance/month-context', 'get'> => api.get('/attendance/month-context', withDedupeEscape({ params }, opts))
