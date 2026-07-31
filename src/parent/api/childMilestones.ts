// src/parent/api/childMilestones.ts
import api from './index'

export const fetchChildMilestones = (studentId: number, params: unknown = {}) =>
  api.get('/parent/milestones', { params: { student_id: studentId, ...(params as object) } })

export const reactToMilestone = (studentId: number, milestoneId: number, reaction: string) =>
  api.post(`/parent/milestones/${milestoneId}/react`,
    { reaction },
    { params: { student_id: studentId } })

// TODO(parent-portal): 後端支援里程碑家長「確認」流程，前端目前只做了
// reactToMilestone（按讚/愛心/慶祝），確認（acknowledge）流程沒有 UI 入口
// （2026-07-31 家長端體檢：孤兒 API，非死碼，是功能缺口）。
export const acknowledgeMilestone = (studentId: number, milestoneId: number) =>
  api.post(`/parent/milestones/${milestoneId}/acknowledge`, null,
    { params: { student_id: studentId } })

export const REACTION_EMOJI = {
  like: '👍',
  love: '🥰',
  celebrate: '🎉',
}
