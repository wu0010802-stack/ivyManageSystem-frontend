import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PortalBatchMeasurementSheet from '@/components/portal/sheets/PortalBatchMeasurementSheet.vue'
import * as apiMeas from '@/api/portalMeasurements'

vi.mock('@/api/portalMeasurements')

const baseMountOpts = () => ({
  props: { modelValue: true },
  global: { stubs: { teleport: true } },
})

describe('PortalBatchMeasurementSheet', () => {
  beforeEach(() => {
    apiMeas.getMeasurementsLatest = vi.fn().mockResolvedValue({
      data: [
        { student_id: 1, name: '甲', classroom_id: 10, last_measurement: null },
        { student_id: 2, name: '乙', classroom_id: 10, last_measurement: null },
        { student_id: 3, name: '丙', classroom_id: 10, last_measurement: null },
      ],
    })
    apiMeas.createMeasurement = vi.fn().mockResolvedValue({ data: {} })
  })

  it('skips rows with no values entered on submit', async () => {
    const wrapper = mount(PortalBatchMeasurementSheet, baseMountOpts())
    await flushPromises()
    // 只填學生 1 的身高，留 2 / 3 空
    await wrapper.find('[data-test="height-1"]').setValue('100')
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()
    expect(apiMeas.createMeasurement).toHaveBeenCalledTimes(1)
    expect(apiMeas.createMeasurement).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ height_cm: '100' }),
    )
  })

  it('lists failed rows for retry when one POST fails', async () => {
    apiMeas.createMeasurement = vi.fn()
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ response: { data: { detail: '測試失敗' } } })
    const wrapper = mount(PortalBatchMeasurementSheet, baseMountOpts())
    await flushPromises()
    await wrapper.find('[data-test="height-1"]').setValue('100')
    await wrapper.find('[data-test="height-2"]').setValue('101')
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()
    // 第二筆失敗 → 該 row 標紅、出現重試按鈕
    expect(wrapper.find('[data-test="failed-row-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="retry-btn"]').exists()).toBe(true)
  })
})
