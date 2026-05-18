import api from './index'

// 跨模型學生紀錄聚合（事件 + 評量 + 異動）。
// 後端端點：GET /api/students/records
// type 陣列序列化：`indexes: null` 產生 `type=a&type=b`（FastAPI Query(List[str]) 預期格式）。
export function getStudentRecordsTimeline(params: unknown = {}) {
  return api.get('/students/records', {
    params,
    paramsSerializer: { indexes: null },
  })
}

// 教務摘要：本學期出席率 / 請假天 / 評量數 / 事件數
// 後端端點：GET /api/students/{id}/academic-summary?school_year=&semester=
export function getAcademicSummary(studentId: number, params: unknown = {}) {
  return api.get(`/students/${studentId}/academic-summary`, { params })
}
