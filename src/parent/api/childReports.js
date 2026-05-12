import api from './index'

export const fetchChildReports = (studentId) =>
  api.get('/parent/growth-reports', { params: { student_id: studentId } })

export const childReportDownloadUrl = (studentId, reportId) =>
  `${api.defaults.baseURL}/parent/growth-reports/${reportId}/download?student_id=${studentId}`
