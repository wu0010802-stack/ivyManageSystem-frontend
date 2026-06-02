import { describe, it, expect } from 'vitest'
import { sectionForStudentField, type StudentFormSection } from '@/constants/studentFormSections'

describe('studentFormSections', () => {
  it('已知欄位對到正確區段', () => {
    expect(sectionForStudentField('parent_phone')).toBe('parent')
    expect(sectionForStudentField('emergency_contact_phone')).toBe('emergency')
    expect(sectionForStudentField('allergy')).toBe('health')
    expect(sectionForStudentField('status_tag')).toBe('other')
    expect(sectionForStudentField('id_number')).toBe('gov')
  })
  it('核心欄位回 core', () => {
    expect(sectionForStudentField('name')).toBe('core')
    expect(sectionForStudentField('classroom_id')).toBe('core')
  })
  it('未知欄位 fallback 回 core', () => {
    expect(sectionForStudentField('not_a_field')).toBe('core')
  })
})
