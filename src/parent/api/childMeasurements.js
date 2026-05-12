// src/parent/api/childMeasurements.js
import api from './index'

export const fetchChildMeasurements = (studentId, params = {}) =>
  api.get('/parent/measurements', { params: { student_id: studentId, ...params } })

export const fetchChildMeasurementChart = (studentId, months = 24) =>
  api.get('/parent/measurements/chart-data', { params: { student_id: studentId, months } })
