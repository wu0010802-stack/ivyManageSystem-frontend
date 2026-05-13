import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PortalMilestoneSheet from '@/components/portal/sheets/PortalMilestoneSheet.vue'
import * as apiMs from '@/api/portalMilestones'

vi.mock('@/api/portalMilestones')

const baseMountOpts = () => ({
  props: { modelValue: true, studentId: 42, studentName: '王小明' },
  global: { stubs: { teleport: true } },
})

describe('PortalMilestoneSheet', () => {
  beforeEach(() => {
    apiMs.createMilestone = vi.fn().mockResolvedValue({ data: {} })
  })

  it('submit disabled when type unselected', () => {
    const wrapper = mount(PortalMilestoneSheet, baseMountOpts())
    expect(
      wrapper.find('[data-test="submit-btn"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('submit disabled when title empty even if type chosen', async () => {
    const wrapper = mount(PortalMilestoneSheet, baseMountOpts())
    await wrapper.find('[data-test="type-first_solo_event"]').trigger('click')
    expect(
      wrapper.find('[data-test="submit-btn"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('icon field stays null when no emoji picked', async () => {
    const wrapper = mount(PortalMilestoneSheet, baseMountOpts())
    await wrapper.find('[data-test="type-first_solo_event"]').trigger('click')
    await wrapper.find('[data-test="input-title"]').setValue('第一次自己穿鞋')
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()
    const payload = apiMs.createMilestone.mock.calls[0][1]
    expect(payload.icon == null).toBe(true)
    expect(payload.milestone_type).toBe('first_solo_event')
  })
})
