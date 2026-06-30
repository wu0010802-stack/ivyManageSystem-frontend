import { describe, it, expect } from 'vitest'
import { filterRoster } from '@/components/enrollment/rosterFilter'
import type { Roster } from '@/components/enrollment/rosterTypes'

const roster: Roster = {
  school_year: 2026,
  semester: 1,
  generated_date: '1150517',
  classes: [
    {
      classroom_id: 1,
      class_number: 1,
      grade_name: '幼幼',
      class_name: '幼幼1',
      head_teacher_name: null,
      assistant_teacher_name: null,
      art_teacher_name: null,
      students: [{ student_id: 1, name: '甲', status_tag: '新生' }],
      total: 1,
      old_count: 0,
      new_count: 1,
    },
    {
      classroom_id: 2,
      class_number: 2,
      grade_name: '中班',
      class_name: '中1',
      head_teacher_name: null,
      assistant_teacher_name: null,
      art_teacher_name: null,
      students: [{ student_id: 2, name: '乙', status_tag: null }],
      total: 1,
      old_count: 1,
      new_count: 0,
    },
  ],
  grade_summaries: [],
  grand_total: 2,
  old_grand_total: 1,
  new_grand_total: 1,
  staff_by_role: {},
}

describe('filterRoster', () => {
  it('依年級篩選只留該年級班 + 重算總計', () => {
    const r = filterRoster(roster, ['幼幼'], [])
    expect(r.classes.map(c => c.class_name)).toEqual(['幼幼1'])
    expect(r.grand_total).toBe(1)
    expect(r.old_grand_total).toBe(0)
    expect(r.new_grand_total).toBe(1)
  })

  it('空篩選回全部（identity shortcut）', () => {
    const r = filterRoster(roster, [], [])
    expect(r).toBe(roster)
    expect(r.classes.length).toBe(2)
    expect(r.grand_total).toBe(2)
  })

  it('依班級 classroom_id 篩選', () => {
    const r = filterRoster(roster, [], [2])
    expect(r.classes.map(c => c.classroom_id)).toEqual([2])
    expect(r.grand_total).toBe(1)
  })

  it('年級篩選後 grade_summaries 重算', () => {
    const r = filterRoster(roster, ['幼幼'], [])
    expect(r.grade_summaries.length).toBe(1)
    expect(r.grade_summaries[0].grade_name).toBe('幼幼')
    expect(r.grade_summaries[0].total).toBe(1)
  })
})
