import { describe, expect, it } from 'vitest'
import { formatTeacherOptionLabel } from '../teacherOption'

describe('formatTeacherOptionLabel', () => {
  it('同名教師可由工號與職稱區分', () => {
    const a = formatTeacherOptionLabel({ id: 1, name: '吳逸倫', employee_id: 'SP001', position: '主任' })
    const b = formatTeacherOptionLabel({ id: 2, name: '吳逸倫', employee_id: '115001', position: '司機' })

    expect(a).not.toBe(b)
    expect(a).toContain('SP001')
    expect(a).toContain('主任')
  })

  it('姓名永遠在最前面，維持既有掃視習慣', () => {
    expect(formatTeacherOptionLabel({ id: 1, name: '王小明', employee_id: 'T001', position: '班導' })).toMatch(/^王小明/)
  })

  it('缺職稱時只帶工號，不留下空括號或多餘分隔符', () => {
    expect(formatTeacherOptionLabel({ id: 1, name: '王小明', employee_id: 'T001' })).toBe('王小明（T001）')
  })

  it('缺工號時只帶職稱', () => {
    expect(formatTeacherOptionLabel({ id: 1, name: '王小明', position: '班導' })).toBe('王小明（班導）')
  })

  it('兩者都缺時退回純姓名', () => {
    expect(formatTeacherOptionLabel({ id: 1, name: '王小明' })).toBe('王小明')
  })

  it('空字串視同未填', () => {
    expect(formatTeacherOptionLabel({ id: 1, name: '王小明', employee_id: '', position: '  ' })).toBe('王小明')
  })
})
