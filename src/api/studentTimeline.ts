import api from './index'

const base = (studentId: number) => `/students/${studentId}/timeline`

export const fetchTimeline = (studentId: number, params: unknown = {}) =>
  api.get(base(studentId), { params })

export const TIMELINE_SOURCE_TYPES = [
  { value: 'observation', label: '觀察', icon: '📝' },
  { value: 'assessment', label: '評量', icon: '📊' },
  { value: 'incident', label: '事件', icon: '⚠️' },
  { value: 'communication', label: '溝通', icon: '💬' },
  { value: 'contact_book', label: '聯絡簿', icon: '📒' },
  { value: 'attendance', label: '出勤', icon: '📅' },
  { value: 'activity', label: '活動', icon: '🎨' },
  { value: 'milestone', label: '里程碑', icon: '🏆' },
  { value: 'measurement', label: '量測', icon: '📏' },
]
