import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import InnerGradeStepperRow from '@/components/student/tabs/lifecycle/InnerGradeStepperRow.vue'

const grades = [
  { grade_id: 1, name: '幼幼', sort_order: 1, status: 'skipped', entered_at: null, expected_at: null, classroom_name: null },
  { grade_id: 2, name: '小班', sort_order: 2, status: 'done', entered_at: '2024-08-15', expected_at: null, classroom_name: '小班A' },
  { grade_id: 3, name: '中班', sort_order: 3, status: 'current', entered_at: '2025-08-01', expected_at: null, classroom_name: '中班A' },
  { grade_id: 4, name: '大班', sort_order: 4, status: 'future', entered_at: null, expected_at: null, classroom_name: null },
] as const

describe('InnerGradeStepperRow', () => {
  it('renders all grades in order', () => {
    const w = mount(InnerGradeStepperRow, { props: { grades: [...grades] } })
    const dots = w.findAll('[data-testid^="grade-"]')
    expect(dots).toHaveLength(4)
  })

  it('applies status-* class to each dot', () => {
    const w = mount(InnerGradeStepperRow, { props: { grades: [...grades] } })
    expect(w.find('[data-testid="grade-1"]').classes()).toContain('status-skipped')
    expect(w.find('[data-testid="grade-2"]').classes()).toContain('status-done')
    expect(w.find('[data-testid="grade-3"]').classes()).toContain('status-current')
    expect(w.find('[data-testid="grade-4"]').classes()).toContain('status-future')
  })

  it('shows entered_at only when present', () => {
    const w = mount(InnerGradeStepperRow, { props: { grades: [...grades] } })
    expect(w.find('[data-testid="grade-2"]').text()).toContain('2024-08-15')
    expect(w.find('[data-testid="grade-1"]').text()).not.toContain('2024')
  })

  it('handles empty grades list', () => {
    const w = mount(InnerGradeStepperRow, { props: { grades: [] } })
    expect(w.findAll('[data-testid^="grade-"]')).toHaveLength(0)
  })
})
