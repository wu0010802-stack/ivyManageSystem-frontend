// src/parent/api/childMilestones.ts
import api from './index'

export const fetchChildMilestones = (studentId: number, params: unknown = {}) =>
  api.get('/parent/milestones', { params: { student_id: studentId, ...(params as object) } })

export const reactToMilestone = (studentId: number, milestoneId: number, reaction: string) =>
  api.post(`/parent/milestones/${milestoneId}/react`,
    { reaction },
    { params: { student_id: studentId } })

// 家長「我看到了」：純標記已看過（不動 reaction），後端 first-ack-wins。
// UI 入口在 MilestoneCard（2026-08-10 補；此前是有 wrapper 沒畫面的孤兒 API）。
export const acknowledgeMilestone = (studentId: number, milestoneId: number) =>
  api.post(`/parent/milestones/${milestoneId}/acknowledge`, null,
    { params: { student_id: studentId } })

export const REACTION_EMOJI = {
  like: '👍',
  love: '🥰',
  celebrate: '🎉',
}
