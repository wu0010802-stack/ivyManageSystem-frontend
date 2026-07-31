// src/parent/api/childMeasurements.ts
import api from './index'

// TODO(parent-portal): 後端支援逐筆量測記錄，前端「健康紀錄」頁
// （ChildMeasurementsView.vue）目前只用 fetchChildMeasurementChart 畫成長曲線，
// 缺一個「查看歷次量測明細」的清單畫面（2026-07-31 家長端體檢：孤兒 API，
// 非死碼，是功能缺口）。
export const fetchChildMeasurements = (studentId: number, params: unknown = {}) =>
  api.get('/parent/measurements', { params: { student_id: studentId, ...(params as object) } })

export const fetchChildMeasurementChart = (studentId: number, months = 24) =>
  api.get('/parent/measurements/chart-data', { params: { student_id: studentId, months } })
