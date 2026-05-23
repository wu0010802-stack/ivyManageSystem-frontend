import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '@/api'
import * as funnel from '../recruitmentFunnel'

describe('recruitmentFunnel API wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getFunnelBoard sends GET /funnel/board with no params', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { stages: {}, summary: {} } })
    await funnel.getFunnelBoard()
    expect(api.get).toHaveBeenCalledWith('/funnel/board', expect.any(Object))
  })

  it('getFunnelBoard passes school_year + semester params', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { stages: {}, summary: {} } })
    await funnel.getFunnelBoard({ schoolYear: 115, semester: 1 })
    expect(api.get).toHaveBeenCalledWith(
      '/funnel/board',
      expect.objectContaining({ params: { school_year: 115, semester: 1 } }),
    )
  })

  it('transitionVisit sends POST with body', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await funnel.transitionVisit(42, {
      to_stage: 'enrolled',
      classroom_id: 3,
    })
    expect(api.post).toHaveBeenCalledWith(
      '/funnel/visits/42/transition',
      { to_stage: 'enrolled', classroom_id: 3 },
    )
  })

  it('getTimeline sends GET', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { events: [] } })
    await funnel.getTimeline(42)
    expect(api.get).toHaveBeenCalledWith('/funnel/visits/42/timeline')
  })
})
