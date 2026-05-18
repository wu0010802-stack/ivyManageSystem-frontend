// src/parent/api/childMilestones.js
import api from './index'

export const fetchChildMilestones = (studentId: number, params: unknown = {}) =>
  api.get('/parent/milestones', { params: { student_id: studentId, ...(params as object) } })

export const reactToMilestone = (studentId: number, milestoneId: number, reaction: string) =>
  api.post(`/parent/milestones/${milestoneId}/react`,
    { reaction },
    { params: { student_id: studentId } })

export const acknowledgeMilestone = (studentId: number, milestoneId: number) =>
  api.post(`/parent/milestones/${milestoneId}/acknowledge`, null,
    { params: { student_id: studentId } })

export const REACTION_EMOJI = {
  like: '👍',
  love: '🥰',
  celebrate: '🎉',
}
