import type { ApiResponse } from '@/api/_generated/typed'
import { LEAVE_TYPE_MAP } from '@/utils/leaves'

type RecordRow = ApiResponse<'/attendance/records', 'get'>[number]
type Day = ApiResponse<'/attendance/month-context', 'get'>['days'][number]

/** 匯出供 EmployeeMonthPanel 判定「未來日」收合區段用；邏輯不變、只是曝露既有函式。 */
export function taipeiDate(now: number): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}

/** 後端應出勤日為日期權威；合成列保留 record=null，不建立假 Attendance id。 */
export function buildAttendanceMonthRows(days: Day[], records: RecordRow[], now: number) {
  const dayMap = new Map(days.map(day => [day.date, day]))
  const recordMap = new Map(records.map(record => [record.date, record]))
  const dates = new Set([...days.filter(day => day.is_expected_workday).map(day => day.date), ...recordMap.keys()])
  return [...dates].sort().map(date => {
    const day = dayMap.get(date)
    const record = recordMap.get(date) ?? null
    const missing = !record?.punch_in || !record?.punch_out
    const start = day?.expected_start_at ? Date.parse(day.expected_start_at) : null
    const end = day?.expected_end_at ? Date.parse(day.expected_end_at) : null
    const ended = end !== null ? now >= end : !day && date < taipeiDate(now)
    const fullLeave = day?.full_day_leave ?? false
    const leaveLabel = (day?.approved_leaves ?? []).map(leave => {
      const label = LEAVE_TYPE_MAP[leave.leave_type]?.label ?? '核准請假'
      return leave.is_full_day ? label : `${label}（${leave.start_time ?? '00:00'}–${leave.end_time ?? '24:00'}）`
    }).join('、')
    let status = '正常'
    if (fullLeave) status = '已核准請假'
    else if (day?.is_expected_workday && !day.schedule_known) status = '班表待確認'
    else if (day?.is_expected_workday && start !== null && now < start) status = date > taipeiDate(now) ? '尚未到班日' : '尚未到班時段'
    else if (day && !day.is_expected_workday) status = '非應出勤日打卡'
    else if (missing) status = ended ? '缺卡待確認' : '尚未完成打卡'
    else if (record?.is_late && record.is_early_leave) status = '遲到、早退'
    else if (record?.is_late) status = '遲到'
    else if (record?.is_early_leave) status = '早退'
    else if (record?.status === 'leave') status = '請假'
    else if (record?.status && !['normal', 'present'].includes(record.status)) {
      status = ({ late: '遲到', early_leave: '早退', missing_punch: '缺卡待確認', partial_leave: '部分請假', absent: '缺卡待確認' } as Record<string, string>)[record.status] ?? '待確認'
    }
    return {
      date, record, status, leaveLabel,
      expectedLabel: day?.expected_start_at && day.expected_end_at
        ? `${day.expected_start_at.slice(11, 16)}–${day.expected_end_at.slice(0, 10) !== date ? '次日 ' : ''}${day.expected_end_at.slice(11, 16)}` : '—',
      weekday: new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(new Date(`${date}T12:00:00+08:00`)),
      canSupplement: record ? (missing || record.is_late || record.is_early_leave) : missing && !fullLeave && ended && !!day?.is_expected_workday && day.schedule_known,
      warning: ['缺卡待確認', '遲到', '早退', '遲到、早退', '班表待確認', '待確認'].includes(status),
    }
  })
}
