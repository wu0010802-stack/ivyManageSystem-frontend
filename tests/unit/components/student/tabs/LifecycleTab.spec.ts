import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/studentLifecycle', () => ({
  getLifecycleOverview: vi.fn(),
}))
vi.mock('@/api/studentTimeline', () => ({
  fetchTimeline: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

import LifecycleTab from '@/components/student/tabs/LifecycleTab.vue'
import { getLifecycleOverview } from '@/api/studentLifecycle'

const mockOv = getLifecycleOverview as unknown as ReturnType<typeof vi.fn>

const baseOverview = {
  student_id: 1,
  current_stage: 'active',
  on_leave_badge: false,
  on_leave_since: null,
  outer_steps: [
    { key: 'visited', label: '參觀', status: 'done', occurred_at: '2024-07-12', meta: null },
    { key: 'deposited', label: '預繳', status: 'done', occurred_at: '2024-08-01', meta: null },
    { key: 'enrolled', label: '報到', status: 'done', occurred_at: '2024-08-15', meta: null },
    { key: 'active', label: '在學', status: 'current', occurred_at: '2024-09-01', meta: null },
    { key: 'terminal', label: '終態', status: 'future', occurred_at: null, meta: null },
  ],
  inner_grade_steps: [
    { grade_id: 2, name: '小班', sort_order: 2, status: 'current', entered_at: '2024-08-15', expected_at: null, classroom_name: '小班A' },
  ],
  terminal: { kind: 'none', actual_date: null, expected_date: '2027-07-31' },
}

beforeEach(() => {
  mockOv.mockReset()
})

describe('LifecycleTab', () => {
  it('shows outer stepper + inner grades + timeline section when loaded', async () => {
    mockOv.mockResolvedValue({ data: baseOverview })
    const w = mount(LifecycleTab, {
      props: { studentId: 1, active: true },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-testid="outer-stepper"]').exists()).toBe(true)
    expect(w.find('[data-testid="inner-grade-stepper"]').exists()).toBe(true)
    expect(w.find('[data-testid="lifecycle-timeline"]').exists()).toBe(true)
  })

  it('shows on-leave banner when on_leave_badge is true', async () => {
    mockOv.mockResolvedValue({
      data: { ...baseOverview, on_leave_badge: true, on_leave_since: '2025-03-01' },
    })
    const w = mount(LifecycleTab, {
      props: { studentId: 1, active: true },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-testid="on-leave-banner"]').text()).toContain('2025-03-01')
  })

  it('shows error alert when load fails', async () => {
    mockOv.mockRejectedValue(new Error('boom'))
    const w = mount(LifecycleTab, {
      props: { studentId: 1, active: true },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-testid="lifecycle-error"]').text()).toContain('boom')
  })
})
