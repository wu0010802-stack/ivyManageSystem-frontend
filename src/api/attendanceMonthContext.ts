import api from './index'
import { withDedupeEscape, type ReadOptions } from '@/utils/apiDedupe'
import type { ApiQuery, AxiosResp } from './_generated/typed'

/** 取得所選月份任職名冊與指定員工的應出勤日、核准請假摘要。 */
export const getAttendanceMonthContext = (
  params: ApiQuery<'/attendance/month-context', 'get'>,
  opts?: ReadOptions,
): AxiosResp<'/attendance/month-context', 'get'> => api.get('/attendance/month-context', withDedupeEscape({ params }, opts))

/** 排班與出勤進頁的預設月份：上個月有出勤、薪資還沒全部封存就回上個月（月初還在趕上個月薪資） */
export const getAttendanceWorkingMonth = (): AxiosResp<'/attendance/working-month', 'get'> =>
  api.get('/attendance/working-month')
