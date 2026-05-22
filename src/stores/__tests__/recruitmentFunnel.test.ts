import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/recruitmentFunnel', () => ({
  getFunnelBoard: vi.fn(),
  transitionVisit: vi.fn(),
  getTimeline: vi.fn(),
}))

import * as funnelApi from '@/api/recruitmentFunnel'
import { useRecruitmentFunnelStore } from '../recruitmentFunnel'

const sampleBoard = {
  data: {
    stages: {
      visited: [{ visit_id: 1, child_name: '甲', current_stage: 'visited' }],
      deposited: [{ visit_id: 2, child_name: '乙', current_stage: 'deposited' }],
      enrolled: [],
      active: [],
    },
    summary: { visited_count: 1, deposited_count: 1, enrolled_count: 0, active_count: 0 },
  },
}

describe('useRecruitmentFunnelStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadBoard fetches and stores board', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    expect(store.board?.summary.visited_count).toBe(1)
    expect(store.getStageCards('visited').length).toBe(1)
  })

  it('setFilter triggers loadBoard with new params', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    const store = useRecruitmentFunnelStore()
    await store.setFilter(115, 1)
    expect(funnelApi.getFunnelBoard).toHaveBeenCalledWith({ schoolYear: 115, semester: 1 })
  })

  it('transition optimistic moves card on success', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    ;(funnelApi.transitionVisit as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        visit_id: 1, from_stage: 'visited', to_stage: 'deposited',
        student_id: null, event_log_id: 100, warnings: [],
      },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    await store.transition(1, 'deposited', {})
    expect(store.getStageCards('visited').length).toBe(0)
    expect(store.getStageCards('deposited').length).toBe(2)
  })

  it('transition reverts card on API failure', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    ;(funnelApi.transitionVisit as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { detail: { code: 'REASON_REQUIRED' } } },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    await expect(store.transition(1, 'deposited', {})).rejects.toBeTruthy()
    expect(store.getStageCards('visited').length).toBe(1)
    expect(store.getStageCards('deposited').length).toBe(1)
  })

  it('transition on 409 force reloads board', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    ;(funnelApi.transitionVisit as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 409, data: { detail: { code: 'STAGE_ALREADY' } } },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockClear()
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    await expect(store.transition(1, 'deposited', {})).rejects.toBeTruthy()
    expect(funnelApi.getFunnelBoard).toHaveBeenCalled()
  })

  it('loadTimeline caches by visit_id', async () => {
    ;(funnelApi.getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { events: [{ source: 'recruitment', event_type: 'deposit_added', created_at: '2026-05-22T00:00:00' }] },
    })
    const store = useRecruitmentFunnelStore()
    await store.loadTimeline(1)
    await store.loadTimeline(1)
    expect(funnelApi.getTimeline).toHaveBeenCalledTimes(1)
  })

  it('invalidateTimeline forces re-fetch', async () => {
    ;(funnelApi.getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { events: [] } })
    const store = useRecruitmentFunnelStore()
    await store.loadTimeline(1)
    store.invalidateTimeline(1)
    await store.loadTimeline(1)
    expect(funnelApi.getTimeline).toHaveBeenCalledTimes(2)
  })

  it('isPending true while transition in-flight', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    let resolveTransition!: (v: unknown) => void
    ;(funnelApi.transitionVisit as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(r => { resolveTransition = r }),
    )
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    const p = store.transition(1, 'deposited', {})
    expect(store.isPending(1)).toBe(true)
    resolveTransition({ data: { visit_id: 1, from_stage: 'visited', to_stage: 'deposited', student_id: null, event_log_id: 1, warnings: [] } })
    await p
    expect(store.isPending(1)).toBe(false)
  })

  it('$reset clears state', async () => {
    ;(funnelApi.getFunnelBoard as ReturnType<typeof vi.fn>).mockResolvedValue(sampleBoard)
    const store = useRecruitmentFunnelStore()
    await store.loadBoard()
    store.$reset()
    expect(store.board).toBeNull()
  })
})
