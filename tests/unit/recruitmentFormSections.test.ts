import { describe, it, expect } from 'vitest'
import { sectionForRecruitmentField } from '@/constants/recruitmentFormSections'

describe('recruitmentFormSections', () => {
  it('已知欄位對到正確區段', () => {
    expect(sectionForRecruitmentField('district')).toBe('contact')
    expect(sectionForRecruitmentField('has_deposit')).toBe('deposit')
    expect(sectionForRecruitmentField('notes')).toBe('notes')
  })
  it('核心/常駐/未知欄位回 core', () => {
    expect(sectionForRecruitmentField('child_name')).toBe('core')
    expect(sectionForRecruitmentField('geocoding_consent')).toBe('core')
    expect(sectionForRecruitmentField('not_a_field')).toBe('core')
  })
})
