// src/views/appraisal/__tests__/useCreateCycle.spec.ts
//
// Task A7：統一建週期入口的共用 composable。
// buildCreateCyclePayload 為純函式（brief Step 1 原題）；resetToCurrentTerm/submit
// 額外補測，驗證「當前學年學期帶入、target/actual 留空、不預帶任何建議值」。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/appraisal', () => ({
  createAppraisalCycle: vi.fn(),
}))

const termState = { school_year: 114, semester: 1 }
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({
    get school_year() { return termState.school_year },
    get semester() { return termState.semester },
  }),
}))

import { createAppraisalCycle } from '@/api/appraisal'
import { buildCreateCyclePayload, useCreateCycle } from '../composables/useCreateCycle'

describe('buildCreateCyclePayload', () => {
  it('target 留空(null)時送 0', () => {
    expect(buildCreateCyclePayload({ academic_year: 114, semester: 'FIRST', enrollment_target: null, enrollment_actual: null }))
      .toEqual({ academic_year: 114, semester: 'FIRST', enrollment_target: 0, enrollment_actual: null })
  })
  it('target 有值時原樣送出', () => {
    expect(buildCreateCyclePayload({ academic_year: 114, semester: 'SECOND', enrollment_target: 160, enrollment_actual: 152 }))
      .toEqual({ academic_year: 114, semester: 'SECOND', enrollment_target: 160, enrollment_actual: 152 })
  })
})

describe('useCreateCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    termState.school_year = 114
    termState.semester = 1
  })

  it('初始 form 帶當前學年學期，target/actual 留空', () => {
    const { form } = useCreateCycle()
    expect(form.value).toEqual({
      academic_year: 114,
      semester: 'FIRST',
      enrollment_target: null,
      enrollment_actual: null,
    })
  })

  it('semester=2 時初始/reset 帶 SECOND', () => {
    termState.semester = 2
    const { form, resetToCurrentTerm } = useCreateCycle()
    expect(form.value.semester).toBe('SECOND')
    form.value.semester = 'FIRST'
    resetToCurrentTerm()
    expect(form.value.semester).toBe('SECOND')
  })

  it('resetToCurrentTerm 不預帶任何建議值：即使呼叫前 target/actual 已填值，重置後仍為 null', () => {
    const { form, resetToCurrentTerm } = useCreateCycle()
    form.value.enrollment_target = 999
    form.value.enrollment_actual = 888
    form.value.academic_year = 200
    resetToCurrentTerm()
    expect(form.value).toEqual({
      academic_year: 114,
      semester: 'FIRST',
      enrollment_target: null,
      enrollment_actual: null,
    })
  })

  it('submit 呼叫 createAppraisalCycle(buildCreateCyclePayload(form)) 並回傳建立結果', async () => {
    vi.mocked(createAppraisalCycle).mockResolvedValue({ data: { id: 12 } } as never)
    const { form, submit } = useCreateCycle()
    form.value.enrollment_target = 160
    form.value.enrollment_actual = 152

    const result = await submit()

    expect(createAppraisalCycle).toHaveBeenCalledWith({
      academic_year: 114,
      semester: 'FIRST',
      enrollment_target: 160,
      enrollment_actual: 152,
    })
    expect(result).toEqual({ id: 12 })
  })

  it('submit 時 target 留空送 0', async () => {
    vi.mocked(createAppraisalCycle).mockResolvedValue({ data: { id: 13 } } as never)
    const { submit } = useCreateCycle()

    await submit()

    expect(createAppraisalCycle).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_target: 0, enrollment_actual: null }),
    )
  })
})
