import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/studentTimeline', () => ({
  fetchTimeline: vi.fn(),
}))

import LifecycleTimelineList from '@/components/student/tabs/lifecycle/LifecycleTimelineList.vue'
import { fetchTimeline } from '@/api/studentTimeline'

const mockTimeline = fetchTimeline as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockTimeline.mockReset()
})

describe('LifecycleTimelineList', () => {
  it('loads timeline on mount with all 6 types enabled', async () => {
    mockTimeline.mockResolvedValue({
      data: {
        items: [
          { record_type: 'funnel_event', record_id: 1, summary: '招生階段 - → visited', occurred_at: '2024-07-12' },
          { record_type: 'payment', record_id: 2, summary: '繳交 註冊費 NT$5000', occurred_at: '2024-08-01' },
        ],
      },
    })
    const w = mount(LifecycleTimelineList, {
      props: { studentId: 99 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(mockTimeline).toHaveBeenCalled()
    const [sid, params] = mockTimeline.mock.calls[0]
    expect(sid).toBe(99)
    expect(params.types).toContain('funnel_event')
    expect(params.types).toContain('payment')
    expect(w.findAll('.timeline-item')).toHaveLength(2)
  })

  it('shows empty state when no items', async () => {
    mockTimeline.mockResolvedValue({ data: { items: [] } })
    const w = mount(LifecycleTimelineList, {
      props: { studentId: 99 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-testid="timeline-empty"]').exists()).toBe(true)
  })

  it('shows error message when load fails', async () => {
    mockTimeline.mockRejectedValue(new Error('network down'))
    const w = mount(LifecycleTimelineList, {
      props: { studentId: 99 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-testid="timeline-error"]').text()).toContain('network down')
  })

  it('renders reason in parens when present', async () => {
    mockTimeline.mockResolvedValue({
      data: {
        items: [
          {
            record_type: 'change_log',
            record_id: 5,
            summary: '升狀態為 active',
            occurred_at: '2024-09-01',
            reason: '開學',
          },
        ],
      },
    })
    const w = mount(LifecycleTimelineList, {
      props: { studentId: 99 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('.timeline-item').text()).toContain('開學')
  })
})
