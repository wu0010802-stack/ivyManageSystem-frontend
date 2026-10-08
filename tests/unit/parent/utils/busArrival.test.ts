import { describe, expect, it } from 'vitest'
import { busArrivalEstimate } from '@/parent/utils/busArrival'

const NOW = Date.parse('2026-07-28T23:30:00Z')

describe('娃娃車到站預估', () => {
  it.each(['2026-07-29T07:35:01', '2026-07-28T23:35:01Z', '2026-07-29T07:35:01+08:00'])(
    '以明確台北時區解析 %s，剩餘分鐘向上取整', (eta) => {
      expect(busArrivalEstimate(eta, NOW)).toEqual({ minutes: 6, clock: '07:35' })
    },
  )

  it('不足一分鐘仍顯示一分鐘，不宣稱已抵達', () => {
    expect(busArrivalEstimate('2026-07-29T07:30:01', NOW)).toEqual({ minutes: 1, clock: '07:30' })
  })

  it.each([{ eta: '2026-07-29T07:30:00', clock: '07:30' }, { eta: '2026-07-29T07:29:59', clock: '07:29' }])(
    '已到或超過預估時間 $eta 時等待更新', ({ eta, clock }) => {
      expect(busArrivalEstimate(eta, NOW)).toEqual({ minutes: null, clock })
    },
  )

  it.each([null, undefined, '', '無效時間'])('缺少或無效時間 %s 時沒有預估', (eta) => {
    expect(busArrivalEstimate(eta, NOW)).toEqual({ minutes: null, clock: null })
  })
})
