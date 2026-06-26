import { describe, it, expect } from 'vitest'
import { BREAKPOINTS, MOBILE_MAX_PX } from '@/constants/breakpoints'

describe('breakpoints 常數', () => {
  it('提供 canonical 斷點尺度', () => {
    expect(BREAKPOINTS).toEqual({ xs: 480, sm: 768, md: 1024, lg: 1200 })
  })
  it('手機上界由 sm - 0.02 導出', () => {
    expect(MOBILE_MAX_PX).toBe(767.98)
  })
})
