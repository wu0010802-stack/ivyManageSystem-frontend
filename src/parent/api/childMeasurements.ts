// src/parent/api/childMeasurements.js
import api from './index'

export const fetchChildMeasurements = (studentId: number, params: unknown = {}) =>
  api.get('/parent/measurements', { params: { student_id: studentId, ...(params as object) } })

export const fetchChildMeasurementChart = (studentId: number, months = 24) =>
  api.get('/parent/measurements/chart-data', { params: { student_id: studentId, months } })
