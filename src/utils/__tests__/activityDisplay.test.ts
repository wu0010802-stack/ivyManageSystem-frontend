import { describe, it, expect } from 'vitest'
import { buildFormCardTitle } from '../activityDisplay'

describe('buildFormCardTitle', () => {
  it('有活動日期時，主標題（去｜副標）後接「· 日期」', () => {
    expect(buildFormCardTitle('114 下藝童趣｜課後才藝報名', '2026-02-23')).toBe(
      '114 下藝童趣 · 2026-02-23',
    )
  })

  it('無活動日期時，不留尾部「 · 」', () => {
    expect(buildFormCardTitle('課後才藝報名', '')).toBe('課後才藝報名')
  })

  it('title 為空字串時不報错，回傳空字串', () => {
    expect(buildFormCardTitle('', '')).toBe('')
  })
})
