import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { previewBonusImpact } from '@/api/students'
import BonusImpactPreview from '../BonusImpactPreview.vue'

vi.mock('@/api/students', () => ({
  previewBonusImpact: vi.fn(),
}))

const previewMock = vi.mocked(previewBonusImpact)

const stubs = {
  ElDivider: { template: '<div><slot /></div>' },
  ElAlert: { template: '<div><slot /></div>' },
  ElIcon: { template: '<span><slot /></span>' },
  ElTag: { template: '<span><slot /></span>' },
  ElCollapse: { template: '<div><slot /></div>' },
  ElCollapseItem: { template: '<div><slot /></div>' },
  Right: { template: '<span />' },
}

describe('BonusImpactPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    previewMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('後端遮罩金額為 null 時顯示遮罩文案且不拋 render error', async () => {
    previewMock.mockResolvedValue({
      data: {
        is_festival_month: true,
        year: 2026,
        month: 8,
        affected_classrooms: [
          {
            classroom_id: 10,
            classroom_name: '大班A',
            grade_name: '大班',
            teachers: [
              {
                employee_id: 101,
                name: '李老師',
                role: '帶班老師',
                current_bonus: null,
                projected_bonus: null,
                change: null,
                current_enrollment: 20,
                projected_enrollment: 21,
                target_enrollment: 25,
              },
            ],
          },
        ],
        school_wide_impact: [
          {
            employee_id: 201,
            name: '張主任',
            category: '主管',
            current_bonus: null,
            projected_bonus: null,
            change: null,
          },
        ],
      },
    } as Awaited<ReturnType<typeof previewBonusImpact>>)

    const wrapper = mount(BonusImpactPreview, {
      props: { operation: 'add', classroomId: 10 },
      global: {
        stubs,
        directives: { loading: () => undefined },
      },
    })

    await vi.runAllTimersAsync()
    await flushPromises()

    expect(wrapper.text()).toContain('薪資金額已遮罩')
    expect(wrapper.text()).not.toContain('$')
  })
})
