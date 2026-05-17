import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  getUnreadCount,
  getSwapPendingCount,
  getSubstitutePendingCount,
  getProfile,
  updateProfile,
  getAttendanceSheet,
  getCalendar,
  getMyStudents,
  getPortalStudentDetail,
  revealPortalStudentPhone,
  getMyClassAttendance,
  batchSaveClassAttendance,
  getMyClassAttendanceMonthly,
  exportMyClassAttendance,
  getAnomalies,
  confirmAnomaly,
  getSalaryPreview,
  getPortalAnnouncements,
  markAnnouncementRead,
  getMyLeaves,
  createMyLeave,
  uploadMyLeaveAttachments,
  getMyLeaveAttachment,
  getMyQuotas,
  getMyLeaveStats,
  getMyWorkdayHours,
  getMyOvertimes,
  createMyOvertime,
  deleteMyOvertime,
  getMyPunchCorrections,
  createMyPunchCorrection,
  getMySchedule,
  getSwapRequests,
  getSwapCandidates,
  createSwapRequest,
  respondToSwap,
  cancelSwapRequest,
  respondToSubstitute,
  getMySubstituteRequests,
} from '@/api/portal'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('portal api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.put.mockReset()
    api.delete.mockReset()
  })

  // ----- 通知 -----
  it('getUnreadCount hits /portal/unread-count', async () => {
    api.get.mockResolvedValue({ data: { count: 0 } })
    await getUnreadCount()
    expect(api.get).toHaveBeenCalledWith('/portal/unread-count')
  })

  it('getSwapPendingCount hits /portal/swap-pending-count', async () => {
    api.get.mockResolvedValue({ data: { count: 0 } })
    await getSwapPendingCount()
    expect(api.get).toHaveBeenCalledWith('/portal/swap-pending-count')
  })

  it('getSubstitutePendingCount hits /portal/substitute-pending-count', async () => {
    api.get.mockResolvedValue({ data: { count: 0 } })
    await getSubstitutePendingCount()
    expect(api.get).toHaveBeenCalledWith('/portal/substitute-pending-count')
  })

  // ----- 個人資料 -----
  it('getProfile hits /portal/profile', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getProfile()
    expect(api.get).toHaveBeenCalledWith('/portal/profile')
  })

  it('updateProfile puts to /portal/profile', async () => {
    api.put.mockResolvedValue({ data: {} })
    const payload = { phone: '0912345678' }
    await updateProfile(payload)
    expect(api.put).toHaveBeenCalledWith('/portal/profile', payload)
  })

  // ----- 考勤 -----
  it('getAttendanceSheet hits /portal/attendance-sheet with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { year: 2026, month: 5 }
    await getAttendanceSheet(params)
    expect(api.get).toHaveBeenCalledWith('/portal/attendance-sheet', { params })
  })

  // ----- 行事曆 -----
  it('getCalendar hits /portal/calendar with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { start: '2026-05-01', end: '2026-05-31' }
    await getCalendar(params)
    expect(api.get).toHaveBeenCalledWith('/portal/calendar', { params })
  })

  // ----- 學生 -----
  it('getMyStudents hits /portal/my-students', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getMyStudents()
    expect(api.get).toHaveBeenCalledWith('/portal/my-students')
  })

  it('getPortalStudentDetail hits /portal/students/{id}/detail', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getPortalStudentDetail(42)
    expect(api.get).toHaveBeenCalledWith('/portal/students/42/detail')
  })

  it('revealPortalStudentPhone posts to /portal/students/{id}/reveal-phone', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { reason: '聯絡家長' }
    await revealPortalStudentPhone(42, payload)
    expect(api.post).toHaveBeenCalledWith('/portal/students/42/reveal-phone', payload)
  })

  // ----- 學生點名 -----
  it('getMyClassAttendance hits /portal/my-class-attendance with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { date: '2026-05-17' }
    await getMyClassAttendance(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-class-attendance', { params })
  })

  it('batchSaveClassAttendance posts to /portal/class-attendance/batch', async () => {
    api.post.mockResolvedValue({ data: {} })
    const data = { date: '2026-05-17', items: [{ student_id: 1, status: 'present' }] }
    await batchSaveClassAttendance(data)
    expect(api.post).toHaveBeenCalledWith('/portal/class-attendance/batch', data)
  })

  it('getMyClassAttendanceMonthly hits /portal/my-class-attendance/monthly', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { year: 2026, month: 5 }
    await getMyClassAttendanceMonthly(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-class-attendance/monthly', { params })
  })

  it('exportMyClassAttendance hits export endpoint with responseType blob', async () => {
    api.get.mockResolvedValue({ data: new Blob() })
    const params = { year: 2026, month: 5 }
    await exportMyClassAttendance(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-class-attendance/export', {
      params,
      responseType: 'blob',
    })
  })

  // ----- 異常 -----
  it('getAnomalies hits /portal/anomalies with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { status: 'pending' }
    await getAnomalies(params)
    expect(api.get).toHaveBeenCalledWith('/portal/anomalies', { params })
  })

  it('confirmAnomaly posts to /portal/anomalies/{id}/confirm with action', async () => {
    api.post.mockResolvedValue({ data: {} })
    await confirmAnomaly(42, 'accept')
    expect(api.post).toHaveBeenCalledWith('/portal/anomalies/42/confirm', { action: 'accept' })
  })

  // ----- 薪資 -----
  it('getSalaryPreview hits /portal/salary-preview with params', async () => {
    api.get.mockResolvedValue({ data: {} })
    const params = { year: 2026, month: 5 }
    await getSalaryPreview(params)
    expect(api.get).toHaveBeenCalledWith('/portal/salary-preview', { params })
  })

  // ----- 公告 -----
  it('getPortalAnnouncements hits /portal/announcements with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { limit: 10 }
    await getPortalAnnouncements(params)
    expect(api.get).toHaveBeenCalledWith('/portal/announcements', { params })
  })

  it('markAnnouncementRead posts to /portal/announcements/{id}/read', async () => {
    api.post.mockResolvedValue({ data: {} })
    await markAnnouncementRead(42)
    expect(api.post).toHaveBeenCalledWith('/portal/announcements/42/read')
  })

  // ----- 請假 -----
  it('getMyLeaves hits /portal/my-leaves with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { year: 2026 }
    await getMyLeaves(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-leaves', { params })
  })

  it('createMyLeave posts to /portal/my-leaves', async () => {
    api.post.mockResolvedValue({ data: {} })
    const data = { leave_type: 'sick', start_date: '2026-05-18' }
    await createMyLeave(data)
    expect(api.post).toHaveBeenCalledWith('/portal/my-leaves', data)
  })

  it('uploadMyLeaveAttachments posts multipart to /portal/my-leaves/{id}/attachments', async () => {
    api.post.mockResolvedValue({ data: {} })
    const fd = new FormData()
    fd.append('file', new Blob(['x']))
    await uploadMyLeaveAttachments(42, fd)
    expect(api.post).toHaveBeenCalledWith(
      '/portal/my-leaves/42/attachments',
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  })

  it('getMyLeaveAttachment hits attachment endpoint with responseType blob', async () => {
    api.get.mockResolvedValue({ data: new Blob() })
    await getMyLeaveAttachment(42, 'doc.pdf')
    expect(api.get).toHaveBeenCalledWith('/portal/my-leaves/42/attachments/doc.pdf', {
      responseType: 'blob',
    })
  })

  it('getMyQuotas hits /portal/my-quotas with params', async () => {
    api.get.mockResolvedValue({ data: {} })
    const params = { year: 2026 }
    await getMyQuotas(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-quotas', { params })
  })

  it('getMyLeaveStats hits /portal/my-leave-stats', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getMyLeaveStats()
    expect(api.get).toHaveBeenCalledWith('/portal/my-leave-stats')
  })

  it('getMyWorkdayHours hits /portal/my-workday-hours with params', async () => {
    api.get.mockResolvedValue({ data: {} })
    const params = { date: '2026-05-17' }
    await getMyWorkdayHours(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-workday-hours', { params })
  })

  // ----- 加班 -----
  it('getMyOvertimes hits /portal/my-overtimes with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { year: 2026, month: 5 }
    await getMyOvertimes(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-overtimes', { params })
  })

  it('createMyOvertime posts to /portal/my-overtimes', async () => {
    api.post.mockResolvedValue({ data: {} })
    const data = { date: '2026-05-17', hours: 2 }
    await createMyOvertime(data)
    expect(api.post).toHaveBeenCalledWith('/portal/my-overtimes', data)
  })

  it('deleteMyOvertime deletes /portal/my-overtimes/{id}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteMyOvertime(42)
    expect(api.delete).toHaveBeenCalledWith('/portal/my-overtimes/42')
  })

  // ----- 補打卡 -----
  it('getMyPunchCorrections hits /portal/my-punch-corrections with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { year: 2026, month: 5 }
    await getMyPunchCorrections(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-punch-corrections', { params })
  })

  it('createMyPunchCorrection posts to /portal/my-punch-corrections', async () => {
    api.post.mockResolvedValue({ data: {} })
    const data = { date: '2026-05-17', punch_type: 'in', time: '08:30' }
    await createMyPunchCorrection(data)
    expect(api.post).toHaveBeenCalledWith('/portal/my-punch-corrections', data)
  })

  // ----- 排班 -----
  it('getMySchedule hits /portal/my-schedule with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { year: 2026, month: 5 }
    await getMySchedule(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-schedule', { params })
  })

  it('getSwapRequests hits /portal/swap-requests', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getSwapRequests()
    expect(api.get).toHaveBeenCalledWith('/portal/swap-requests')
  })

  it('getSwapCandidates hits /portal/swap-candidates with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { date: '2026-05-17' }
    await getSwapCandidates(params)
    expect(api.get).toHaveBeenCalledWith('/portal/swap-candidates', { params })
  })

  it('createSwapRequest posts to /portal/swap-requests', async () => {
    api.post.mockResolvedValue({ data: {} })
    const data = { target_employee_id: 5, date: '2026-05-17' }
    await createSwapRequest(data)
    expect(api.post).toHaveBeenCalledWith('/portal/swap-requests', data)
  })

  it('respondToSwap posts to /portal/swap-requests/{id}/respond with action', async () => {
    api.post.mockResolvedValue({ data: {} })
    await respondToSwap(42, 'accept')
    expect(api.post).toHaveBeenCalledWith('/portal/swap-requests/42/respond', { action: 'accept' })
  })

  it('cancelSwapRequest posts to /portal/swap-requests/{id}/cancel', async () => {
    api.post.mockResolvedValue({ data: {} })
    await cancelSwapRequest(42)
    expect(api.post).toHaveBeenCalledWith('/portal/swap-requests/42/cancel')
  })

  // ----- 職務代理人 -----
  it('respondToSubstitute posts to /portal/my-leaves/{id}/substitute-respond', async () => {
    api.post.mockResolvedValue({ data: {} })
    const data = { action: 'accept' }
    await respondToSubstitute(42, data)
    expect(api.post).toHaveBeenCalledWith('/portal/my-leaves/42/substitute-respond', data)
  })

  it('getMySubstituteRequests hits /portal/my-substitute-requests with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    const params = { status: 'pending' }
    await getMySubstituteRequests(params)
    expect(api.get).toHaveBeenCalledWith('/portal/my-substitute-requests', { params })
  })
})
