import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'

vi.mock('@/api/recruitment', () => ({
  getVisitTimeline: vi.fn().mockResolvedValue({
    data: {
      events: [
        { source: 'recruitment', event_type: 'created', from_stage: null, to_stage: 'visited', reason: null, created_at: '2026-03-01T09:00:00' },
        { source: 'student', event_type: '入學', from_stage: null, to_stage: null, reason: '報到', created_at: '2026-04-01T09:00:00' },
      ],
    },
  }),
}))

function mountJourney(visitId: number | null) {
  return mount(JourneyTimeline, {
    props: { visitId },
    global: { plugins: [ElementPlus] },
  })
}

describe('JourneyTimeline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders events with humanized labels', async () => {
    const wrapper = mountJourney(42)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('建立訪視') // EVENT_LABELS['created']
    expect(text).toContain('入學')
  })

  it('empty state when no visitId (no api call)', async () => {
    const { getVisitTimeline } = await import('@/api/recruitment')
    const wrapper = mountJourney(null)
    await flushPromises()
    expect(getVisitTimeline).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('無招生來源紀錄')
  })
})
