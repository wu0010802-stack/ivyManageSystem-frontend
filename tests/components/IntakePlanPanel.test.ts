import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'

vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn().mockResolvedValue({
    data: {
      school_year: 115,
      semester: 1,
      rows: [
        { grade_id: 1, grade_name: '小班', target_seats: 10, reserved_count: 8, enrolled_count: 1, remaining: 1, over_capacity: false },
        { grade_id: 2, grade_name: '中班', target_seats: 5, reserved_count: 4, enrolled_count: 3, remaining: -2, over_capacity: true },
      ],
    },
  }),
  setIntakeTargets: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/classrooms', () => ({
  getGrades: vi.fn().mockResolvedValue({
    data: [
      { id: 1, name: '小班', sort_order: 1 },
      { id: 2, name: '中班', sort_order: 2 },
      { id: 3, name: '大班', sort_order: 3 },
    ],
  }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/academic', () => ({ currentRocYear: () => 115 }))

describe('IntakePlanPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per grade (incl. grade without plan row) and flags over_capacity', async () => {
    const wrapper = mount(IntakePlanPanel, { global: { stubs: { transition: true } } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('小班')
    expect(text).toContain('中班')
    expect(text).toContain('大班') // getGrades 補齊（無 plan row 仍出現）
    expect(wrapper.html()).toMatch(/over-capacity/)
  })

  it('saving a target calls setIntakeTargets', async () => {
    const { setIntakeTargets } = await import('@/api/recruitmentIntake')
    const wrapper = mount(IntakePlanPanel, { global: { stubs: { transition: true } } })
    await flushPromises()
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    await flushPromises()
    expect(setIntakeTargets).toHaveBeenCalled()
  })
})
