/**
 * 教師首頁彙總 API（對應 api/portal/home.py）。
 */
import api from './index'

export function getHomeSummary() {
  return api.get('/portal/home/summary')
}
