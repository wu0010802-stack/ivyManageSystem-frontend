import { describe, it, expect } from 'vitest'
import { buildStudentProfileLink } from '@/utils/studentLinks'

describe('buildStudentProfileLink', () => {
  it('回傳 student-profile route 物件並帶入 id 與 tab', () => {
    expect(buildStudentProfileLink(42, 'attendance')).toEqual({
      name: 'student-profile',
      params: { id: 42 },
      query: { tab: 'attendance' },
    })
  })

  it('沒帶 tab 時 query 為空物件', () => {
    expect(buildStudentProfileLink(7)).toEqual({
      name: 'student-profile',
      params: { id: 7 },
      query: {},
    })
  })

  it('studentId 不是有效數字回傳 null（避免 router push 失敗）', () => {
    expect(buildStudentProfileLink(null, 'records')).toBeNull()
    expect(buildStudentProfileLink(undefined)).toBeNull()
    expect(buildStudentProfileLink(NaN)).toBeNull()
  })
})
