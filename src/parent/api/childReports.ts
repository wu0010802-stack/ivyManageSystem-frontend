import api from './index'

export const fetchChildReports = (studentId: number) =>
  api.get('/parent/growth-reports', { params: { student_id: studentId } })

export const childReportDownloadUrl = (studentId: number, reportId: number) =>
  `${api.defaults.baseURL}/parent/growth-reports/${reportId}/download?student_id=${studentId}`
