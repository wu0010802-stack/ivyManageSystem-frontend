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

  describe('年級列的班級代號', () => {
    const withCodes = (codes: Array<string | null | undefined>): Roster => ({
      ...roster,
      classes: codes.map((code, i) => ({
        ...roster.classes[0],
        classroom_id: i + 1,
        class_number: i + 1,
        class_name: `幼幼${i + 1}`,
        class_code: code,
      })),
      grade_summaries: [
        { grade_name: '幼幼', class_numbers: codes.map((_, i) => i + 1), total: 2, old_count: 1, new_count: 1 },
      ],
    })

    it('有 class_code 時年級列顯示真實代號', () => {
      const w = mount(EnrollmentRosterTable, { props: { roster: withCodes(['幼A', '幼B']) } })
      expect(w.findAll('.grade-cell').map(c => c.text())).toEqual(['幼A', '幼B'])
    })

    it('class_code 為 null、空字串或未提供時退回「年級首字＋年級內序號」', () => {
      const w = mount(EnrollmentRosterTable, { props: { roster: withCodes([null, undefined, '']) } })
      expect(w.findAll('.grade-cell').map(c => c.text())).toEqual(['幼1', '幼2', '幼3'])
    })

    it('同一張表可混合：有代號的班顯示代號、沒有的退回推算值', () => {
      const w = mount(EnrollmentRosterTable, { props: { roster: withCodes(['幼A', null]) } })
      expect(w.findAll('.grade-cell').map(c => c.text())).toEqual(['幼A', '幼2'])
    })

    it('列標籤維持「年級」', () => {
      const w = mount(EnrollmentRosterTable, { props: { roster: withCodes(['幼A']) } })
      expect(w.find('.sticky-grade-row th.row-label').text()).toBe('年級')
    })
  })
})
