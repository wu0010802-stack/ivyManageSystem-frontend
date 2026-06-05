import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import api from '@/api'
import * as intake from '../recruitmentIntake'

describe('recruitmentIntake API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getIntakePlan sends GET with school_year + semester', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { rows: [] } })
    await intake.getIntakePlan({ school_year: 115, semester: 1 })
    expect(api.get).toHaveBeenCalledWith(
      '/recruitment/intake-plan',
      expect.objectContaining({ params: { school_year: 115, semester: 1 } }),
    )
  })

  it('setIntakeTargets sends PUT with body', async () => {
    ;(api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    const body = { school_year: 115, semester: 1, targets: [{ grade_id: 1, target_seats: 10 }] }
    await intake.setIntakeTargets(body)
    expect(api.put).toHaveBeenCalledWith('/recruitment/intake-targets', body)
  })

  it('reserveSeat sends POST with body', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await intake.reserveSeat(42, { provisional_grade_id: 7, target_school_year: 115, target_semester: 1 })
    expect(api.post).toHaveBeenCalledWith(
      '/recruitment/funnel/visits/42/reserve-seat',
      { provisional_grade_id: 7, target_school_year: 115, target_semester: 1 },
    )
  })

  it('reserveSeat release sends null grade', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await intake.reserveSeat(42, { provisional_grade_id: null })
    expect(api.post).toHaveBeenCalledWith(
      '/recruitment/funnel/visits/42/reserve-seat',
      { provisional_grade_id: null },
    )
  })
})
