import { describe, it, expect } from 'vitest'
import { emptyVisitForm } from '@/constants/recruitment'
import { getCurrentAcademicTerm } from '@/utils/academic'

describe('emptyVisitForm', () => {
  it('預設帶當前學年/學期', () => {
    const term = getCurrentAcademicTerm()
    const f = emptyVisitForm()
    expect(f.target_school_year).toBe(term.school_year)
    expect(f.target_semester).toBe(term.semester)
  })
})
