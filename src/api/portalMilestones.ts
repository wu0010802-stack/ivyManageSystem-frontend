/**
 * 學生里程碑教師端 API。後端：api/portfolio/milestones.py。
 * 教師預設角色已含 PORTFOLIO_WRITE；assert_student_access 已守 RBAC。
 */
import api from './index'

export function listMilestones(studentId: number, params: unknown = {}) {
  return api.get(`/students/${studentId}/milestones`, { params })
}

export function createMilestone(studentId: number, payload: unknown) {
  return api.post(`/students/${studentId}/milestones`, payload)
}
