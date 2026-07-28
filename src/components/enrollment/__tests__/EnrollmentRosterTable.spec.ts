import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import EnrollmentRosterTable from '../EnrollmentRosterTable.vue'
import type { Roster } from '../rosterTypes'

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
      head_teacher_name: '王',
      assistant_teacher_name: null,
      art_teacher_name: null,
      students: [
        { seq: 1, student_id: 11, name: '甲', status_tag: '新生' },
        { seq: 2, student_id: 12, name: '乙', status_tag: '特教生' },
      ],
      total: 2,
      old_count: 1,
      new_count: 1,
    },
  ],
  grade_summaries: [
    { grade_name: '幼幼', class_numbers: [1], total: 2, old_count: 1, new_count: 1 },
  ],
  grand_total: 2,
  old_grand_total: 1,
  new_grand_total: 1,
  staff_by_role: { 教師: [{ name: '王' }] },
}

describe('EnrollmentRosterTable', () => {
  it('highlight-keyword 命中學生格加 .is-hit', () => {
    const w = mount(EnrollmentRosterTable, {
      props: { roster, highlightKeyword: '甲' },
    })
    const hits = w.findAll('.is-hit')
    expect(hits.length).toBe(1)
    expect(hits[0].text()).toContain('甲')
  })

  it('點有 student_id 的學生格 emit select-student', async () => {
    const w = mount(EnrollmentRosterTable, { props: { roster } })
    await w.find('.student-cell .student-link').trigger('click')
    const ev = w.emitted('select-student')
    expect(ev).toBeTruthy()
    expect(ev![0][0]).toMatchObject({ id: 11, name: '甲' })
  })

  it('學生連結是可鍵盤聚焦的 button', () => {
    const w = mount(EnrollmentRosterTable, { props: { roster } })
    const link = w.find('.student-cell .student-link')
    expect(link.element.tagName).toBe('BUTTON')
    expect(link.attributes('type')).toBe('button')
  })

  it('狀態標籤除顏色外另有右上標記（a11y）', () => {
    const w = mount(EnrollmentRosterTable, { props: { roster } })
    const marks = w.findAll('.student-cell .status-mark')
    expect(marks.map(m => m.text())).toEqual(['新', '特'])
  })

  it('表頭與列標籤使用語意化 th', () => {
    const w = mount(EnrollmentRosterTable, { props: { roster } })
    expect(w.find('th.class-num-cell').attributes('scope')).toBe('col')
    expect(w.find('tbody th.seq-cell').attributes('scope')).toBe('row')
  })
})
