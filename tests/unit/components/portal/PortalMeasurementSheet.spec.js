import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PortalMeasurementSheet from '@/components/portal/sheets/PortalMeasurementSheet.vue'
import * as apiMeas from '@/api/portalMeasurements'

vi.mock('@/api/portalMeasurements')

const baseMountOpts = () => ({
  props: {
    modelValue: true,
    studentId: 42,
    studentName: '王小明',
    prefill: null,
  },
  global: { stubs: { teleport: true } },
})

describe('PortalMeasurementSheet', () => {
  beforeEach(() => {
    apiMeas.createMeasurement = vi.fn().mockResolvedValue({ data: {} })
  })

  it('submit disabled when all measurement values empty', () => {
    const wrapper = mount(PortalMeasurementSheet, baseMountOpts())
    const btn = wrapper.find('[data-test="submit-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('submit enabled when height_cm has value', async () => {
    const wrapper = mount(PortalMeasurementSheet, baseMountOpts())
    await wrapper.find('[data-test="input-height"]').setValue('108')
    expect(
      wrapper.find('[data-test="submit-btn"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('record-another keeps date but clears values', async () => {
    const wrapper = mount(PortalMeasurementSheet, baseMountOpts())
    await wrapper.find('[data-test="input-height"]').setValue('108')
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="record-another-btn"]').trigger('click')
    expect(wrapper.find('[data-test="input-height"]').element.value).toBe('')
    expect(wrapper.find('[data-test="input-date"]').element.value).not.toBe('')
  })
})
