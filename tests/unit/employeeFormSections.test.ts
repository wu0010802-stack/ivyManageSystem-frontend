import { describe, it, expect } from 'vitest'
import {
  sectionForField,
  sectionsForInvalidFields,
  type EmployeeFormSection,
} from '@/constants/employeeFormSections'

describe('employeeFormSections', () => {
  it('已知欄位對到正確區段', () => {
    expect(sectionForField('phone')).toBe('personal')
    expect(sectionForField('position')).toBe('jobDetail')
    expect(sectionForField('work_start_time')).toBe('worktime')
    expect(sectionForField('teacher_cert_no')).toBe('gov')
    expect(sectionForField('base_salary')).toBe('salary')
  })

  it('核心欄位回 core', () => {
    expect(sectionForField('name')).toBe('core')
    expect(sectionForField('hire_date')).toBe('core')
  })

  it('未知欄位 fallback 回 core', () => {
    expect(sectionForField('not_a_field')).toBe('core')
  })

  it('sectionsForInvalidFields 去重彙整區段', () => {
    const result = sectionsForInvalidFields(['phone', 'address', 'teacher_cert_no'])
    expect(result.sort()).toEqual<EmployeeFormSection[]>(['gov', 'personal'])
  })
})
