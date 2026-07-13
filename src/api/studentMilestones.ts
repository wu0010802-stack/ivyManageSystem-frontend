import api from './index'
import type { ApiQuery, AxiosResp, Schema } from './_generated/typed'

const base = (studentId: number) => `/students/${studentId}/milestones`

export const listMilestones = (
  studentId: number,
  params: ApiQuery<'/students/{student_id}/milestones', 'get'> = {},
): AxiosResp<'/students/{student_id}/milestones', 'get'> =>
  api.get(base(studentId), { params })

export const createMilestone = (studentId: number, payload: unknown) =>
  api.post(base(studentId), payload)

export const updateMilestone = (studentId: number, id: number, payload: unknown) =>
  api.patch(`${base(studentId)}/${id}`, payload)

export const deleteMilestone = (studentId: number, id: number) =>
  api.delete(`${base(studentId)}/${id}`)

// requestBody 為 `AutoDetectPayload | null`（optional body）：typed.ts 的 ApiBody helper
// 對 optional requestBody 會收斂成 never（見 typed.d.ts 對 requiredBody 的推導），故此處
// 改用 Schema<> 直接標註實際 payload 形狀。
export const autoDetectMilestones = (
  studentId: number,
  payload: Schema<'AutoDetectPayload'> = {},
): AxiosResp<'/students/{student_id}/milestones/auto-detect', 'post'> =>
  api.post(`/students/${studentId}/milestones/auto-detect`, payload)

export const MILESTONE_TYPES = [
  { value: 'birthday', label: '生日', icon: '🎂' },
  { value: 'first_day', label: '入學首日', icon: '🌱' },
  { value: 'perfect_attendance_month', label: '滿月全勤', icon: '🏆' },
  { value: 'first_solo_event', label: '首次獨立完成', icon: '🌟' },
  { value: 'assessment_excellence', label: '評量優異', icon: '📚' },
  { value: 'activity_first_join', label: '首次參與活動', icon: '🎉' },
  { value: 'graduation', label: '畢業', icon: '🎓' },
  { value: 'custom', label: '其他', icon: '✨' },
]
