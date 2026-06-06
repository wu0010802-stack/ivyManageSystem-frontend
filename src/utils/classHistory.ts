export interface ClassHistoryCoTeacher {
  role: 'head' | 'assistant' | 'art'
  employee_id: number
  name: string
}

export interface ClassHistoryRow {
  school_year: number
  semester: number
  classroom_id: number
  classroom_name: string
  grade_name: string | null
  role: 'head' | 'assistant'
  co_teachers: ClassHistoryCoTeacher[]
  is_current: boolean
  start_count: number | null
  end_count: number | null
  end_count_is_live: boolean
  net_change: number | null
}

const ROLE_LABELS: Record<string, string> = {
  head: '導師',
  assistant: '助教',
  art: '才藝',
}

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role

export const formatSemester = (schoolYear: number, semester: number): string =>
  `${schoolYear} ${semester === 1 ? '上學期' : '下學期'}`

export const formatCoTeachers = (cos: ClassHistoryCoTeacher[]): string => {
  if (!cos.length) return '—'
  return cos.map(c => `${roleLabel(c.role)} ${c.name}`).join(' · ')
}

export const formatHeadcount = (row: ClassHistoryRow): string => {
  const { start_count, end_count, end_count_is_live } = row
  if (start_count == null && end_count == null) return '— 資料不足'
  const left = start_count == null ? '—' : String(start_count)
  const right =
    end_count == null
      ? '—'
      : end_count_is_live
        ? `目前 ${end_count}`
        : String(end_count)
  return `${left} → ${right}`
}

export type NetChangeType = 'up' | 'down' | 'flat' | 'none'

export const formatNetChange = (
  net: number | null,
): { text: string; type: NetChangeType } => {
  if (net == null) return { text: '—', type: 'none' }
  if (net > 0) return { text: `▲ +${net}`, type: 'up' }
  if (net < 0) return { text: `▼ ${net}`, type: 'down' }
  return { text: '±0', type: 'flat' }
}
