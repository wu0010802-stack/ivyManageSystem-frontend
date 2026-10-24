import { describe, it, expect } from 'vitest'
import { correctionTimes } from '@/utils/punchCorrection'

describe('correctionTimes（QA P3：切換補正類型後隱藏側時間不可送出）', () => {
  it('只送 correction_type 對應那側', () => {
    expect(correctionTimes('punch_out', '2026-09-15', '07:00', '16:30')).toEqual({ requested_punch_in: null, requested_punch_out: '2026-09-15T16:30:00' })
    expect(correctionTimes('punch_in', '2026-09-15', '07:00', '16:30')).toEqual({ requested_punch_in: '2026-09-15T07:00:00', requested_punch_out: null })
    expect(correctionTimes('both', '2026-09-15', '07:00', '16:30')).toEqual({ requested_punch_in: '2026-09-15T07:00:00', requested_punch_out: '2026-09-15T16:30:00' })
  })
  it('沒填或沒日期回 null', () => {
    expect(correctionTimes('both', '2026-09-15', '', '16:30')).toEqual({ requested_punch_in: null, requested_punch_out: '2026-09-15T16:30:00' })
    expect(correctionTimes('both', '', '07:00', '16:30')).toEqual({ requested_punch_in: null, requested_punch_out: null })
  })
})
