import { describe, it, expect } from 'vitest'
import { combineChannels } from '@/utils/recruitmentChannels'

describe('combineChannels', () => {
  it('combines internal funnel_snapshot + ivykids totals', () => {
    const r = combineChannels(
      { visit: 10, deposit: 6, enrolled: 3 },
      { total_visit: 4, total_deposit: 2, total_enrolled: 1 },
    )
    expect(r.internal).toEqual({ visit: 10, deposit: 6, enrolled: 3 })
    expect(r.ivykids).toEqual({ visit: 4, deposit: 2, enrolled: 1 })
    expect(r.total).toEqual({ visit: 14, deposit: 8, enrolled: 4 })
  })
  it('defaults missing fields to 0', () => {
    const r = combineChannels(undefined, undefined)
    expect(r.total).toEqual({ visit: 0, deposit: 0, enrolled: 0 })
  })
})
