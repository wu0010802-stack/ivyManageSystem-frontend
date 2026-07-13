import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

// 跨模型學生紀錄聚合（事件 + 評量 + 異動）。
// 後端端點：GET /api/students/records
// type 陣列序列化：`indexes: null` 產生 `type=a&type=b`（FastAPI Query(List[str]) 預期格式）。
export function getStudentRecordsTimeline(
  params: ApiQuery<'/students/records', 'get'> = {},
): AxiosResp<'/students/records', 'get'> {
  return api.get('/students/records', {
    params,
    paramsSerializer: { indexes: null },
  })
}

// 教務摘要：本學期出席率 / 請假天 / 評量數 / 事件數
// 後端端點：GET /api/students/{id}/academic-summary?school_year=&semester=
export function getAcademicSummary(
  studentId: number,
  params: ApiQuery<'/students/{student_id}/academic-summary', 'get'> = {},
): AxiosResp<'/students/{student_id}/academic-summary', 'get'> {
  return api.get(`/students/${studentId}/academic-summary`, { params })
}
