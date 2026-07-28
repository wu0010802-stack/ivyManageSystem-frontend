import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OuterStepperRow from '@/components/student/tabs/lifecycle/OuterStepperRow.vue'

const baseOverview = {
  student_id: 1,
  current_stage: 'active',
  on_leave_badge: false,
  on_leave_since: null,
  outer_steps: [
    { key: 'visited', label: '參觀', status: 'done', occurred_at: '2024-07-12', meta: null },
    { key: 'deposited', label: '預繳', status: 'done', occurred_at: '2024-08-01', meta: null },
    { key: 'enrolled', label: '註冊', status: 'done', occurred_at: '2024-08-15', meta: null },
    { key: 'active', label: '在學', status: 'current', occurred_at: '2024-09-01', meta: null },
    { key: 'terminal', label: '終態', status: 'future', occurred_at: null, meta: null },
  ],
  inner_grade_steps: [],
  terminal: { kind: 'none', actual_date: null, expected_date: '2027-07-31' },
} as const

describe('OuterStepperRow', () => {
  it('renders 5 dots', () => {
    const w = mount(OuterStepperRow, { props: { overview: { ...baseOverview } } })
    const keys = ['visited', 'deposited', 'enrolled', 'active', 'terminal']
    for (const k of keys) {
      expect(w.find(`[data-testid="outer-${k}"]`).exists()).toBe(true)
    }
  })

  it('shows expected graduation date on terminal future', () => {
    const w = mount(OuterStepperRow, { props: { overview: { ...baseOverview } } })
    expect(w.find('[data-testid="outer-terminal"]').text()).toContain('2027-07-31')
  })

  it('shows graduated label and green color when graduated', () => {
    const ov = {
      ...baseOverview,
      current_stage: 'graduated',
      outer_steps: baseOverview.outer_steps.map((s) =>
        s.key === 'terminal' ? { ...s, status: 'done', occurred_at: '2027-07-01' } : s
      ),
      terminal: { kind: 'graduated', actual_date: '2027-07-01', expected_date: null },
    }
    const w = mount(OuterStepperRow, { props: { overview: ov as never } })
    const dot = w.find('[data-testid="outer-terminal"]')
    expect(dot.text()).toContain('已畢業')
    expect(dot.classes()).toContain('terminal-graduated')
  })

  it('shows on-leave badge when on_leave_badge is true', () => {
    const ov = {
      ...baseOverview,
      current_stage: 'on_leave',
      on_leave_badge: true,
      on_leave_since: '2025-03-01',
    }
    const w = mount(OuterStepperRow, { props: { overview: ov as never } })
    expect(w.find('[data-testid="on-leave-badge"]').exists()).toBe(true)
  })

  it('hides on-leave badge when not on leave', () => {
    const w = mount(OuterStepperRow, { props: { overview: { ...baseOverview } } })
    expect(w.find('[data-testid="on-leave-badge"]').exists()).toBe(false)
  })

  it('terminal withdrawn applies red class', () => {
    const ov = {
      ...baseOverview,
      current_stage: 'withdrawn',
      outer_steps: baseOverview.outer_steps.map((s) =>
        s.key === 'terminal' ? { ...s, status: 'done', occurred_at: '2025-05-01' } : s
      ),
      terminal: { kind: 'withdrawn', actual_date: '2025-05-01', expected_date: null },
    }
    const w = mount(OuterStepperRow, { props: { overview: ov as never } })
    expect(w.find('[data-testid="outer-terminal"]').classes()).toContain('terminal-withdrawn')
  })
})
