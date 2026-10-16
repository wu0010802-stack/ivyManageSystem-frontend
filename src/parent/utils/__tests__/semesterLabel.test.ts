import { describe, it, expect } from 'vitest'
import { formatSemesterLabel } from '../semesterLabel'

describe('formatSemesterLabel', () => {
  it('114-1 轉成家長看得懂的「114 學年上學期」', () => {
    expect(formatSemesterLabel('114-1')).toBe('114 學年上學期')
  })

  it('114-2 轉成「114 學年下學期」', () => {
    expect(formatSemesterLabel('114-2')).toBe('114 學年下學期')
  })

  it('三位數以外的學年也接受（99-1）', () => {
    expect(formatSemesterLabel('99-1')).toBe('99 學年上學期')
  })

  it('非 <年>-<1|2> 形態原樣返回（後端可能已給人話 period）', () => {
    expect(formatSemesterLabel('2026-03')).toBe('2026-03')
    expect(formatSemesterLabel('夏令營')).toBe('夏令營')
    expect(formatSemesterLabel('114-3')).toBe('114-3')
  })

  it('空值回空字串', () => {
    expect(formatSemesterLabel(undefined)).toBe('')
    expect(formatSemesterLabel(null)).toBe('')
    expect(formatSemesterLabel('')).toBe('')
  })
})
