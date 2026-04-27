import api from './index'

export const getFeesSummary = () => api.get('/parent/fees/summary')

export const listFeeRecords = (studentId, period) =>
  api.get('/parent/fees/records', {
    params: {
      student_id: studentId,
      ...(period ? { period } : {}),
    },
  })

export const getFeePayments = (recordId) =>
  api.get(`/parent/fees/records/${recordId}/payments`)
