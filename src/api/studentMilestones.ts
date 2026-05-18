import api from './index'

const base = (studentId: number) => `/students/${studentId}/milestones`

export const listMilestones = (studentId: number, params: unknown = {}) =>
  api.get(base(studentId), { params })

export const createMilestone = (studentId: number, payload: unknown) =>
  api.post(base(studentId), payload)

export const updateMilestone = (studentId: number, id: number, payload: unknown) =>
  api.patch(`${base(studentId)}/${id}`, payload)

export const deleteMilestone = (studentId: number, id: number) =>
  api.delete(`${base(studentId)}/${id}`)

export const autoDetectMilestones = (studentId: number, payload: unknown = {}) =>
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
