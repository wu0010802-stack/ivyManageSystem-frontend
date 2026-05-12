// src/parent/api/childMilestones.js
import api from './index'

export const fetchChildMilestones = (studentId, params = {}) =>
  api.get('/parent/milestones', { params: { student_id: studentId, ...params } })

export const reactToMilestone = (studentId, milestoneId, reaction) =>
  api.post(`/parent/milestones/${milestoneId}/react`,
    { reaction },
    { params: { student_id: studentId } })

export const acknowledgeMilestone = (studentId, milestoneId) =>
  api.post(`/parent/milestones/${milestoneId}/acknowledge`, null,
    { params: { student_id: studentId } })

export const REACTION_EMOJI = {
  like: '👍',
  love: '🥰',
  celebrate: '🎉',
}
