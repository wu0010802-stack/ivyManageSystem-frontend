/**
 * 教師端跨功能快速搜尋 API。後端：api/portal/search.py。
 * 一次回 5 個 entity 各 ≤ 5 筆 + 純前端 hardcode commands。
 */
import api from './index'

export function searchPortal(q: string) {
  return api.get('/portal/search', { params: { q } })
}
