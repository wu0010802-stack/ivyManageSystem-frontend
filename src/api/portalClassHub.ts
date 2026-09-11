/**
 * 教師工作台彙整 API（對應 api/portal/class_hub.py）。
 */
import api from './index'

/**
 * @param classroomId 指定班級；不帶則由後端解析教師的預設班
 *                    （head > assistant > art）。帶了不屬於自己的班 → 403。
 */
export function getTodayHub(classroomId?: number) {
  const params: Record<string, number> = {}
  if (classroomId != null) params.classroom_id = classroomId
  return api.get('/portal/class-hub/today', { params }).then((res) => res.data)
}
