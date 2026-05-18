/**
 * 教師工作台彙整 API（對應 api/portal/class_hub.py）。
 */
import api from './index'

export function getTodayHub() {
  return api.get('/portal/class-hub/today').then((res) => res.data)
}
