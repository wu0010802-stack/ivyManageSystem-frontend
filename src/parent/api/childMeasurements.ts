// src/parent/api/childMeasurements.ts
import api from './index'

// 逐筆量測明細（含成長曲線畫不出來的頭圍與視力）。
// UI 在 ChildMeasurementsView 的「歷次紀錄」區塊（2026-08-10 補；此前是孤兒 API）。
export const fetchChildMeasurements = (studentId: number, params: unknown = {}) =>
  api.get('/parent/measurements', { params: { student_id: studentId, ...(params as object) } })

export const fetchChildMeasurementChart = (studentId: number, months = 24) =>
  api.get('/parent/measurements/chart-data', { params: { student_id: studentId, months } })
