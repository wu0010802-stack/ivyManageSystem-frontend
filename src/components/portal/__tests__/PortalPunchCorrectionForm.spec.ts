import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { ref } from 'vue'
import PortalPunchCorrectionForm from '../PortalPunchCorrectionForm.vue'

vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: ref(false) }) }))

describe('PortalPunchCorrectionForm（QA P3）', () => {
  it('先選補全天填了兩側、再改補下班：只送下班時間', async () => {
    const wrapper = mount(PortalPunchCorrectionForm, { global: { plugins: [ElementPlus] } })
    const form = (wrapper.vm as unknown as { form: Record<string, string> }).form
    form.attendance_date = '2026-09-15'
    form.correction_type = 'both'
    form.requested_punch_in_time = '07:00'
    form.requested_punch_out_time = '16:30'
    await flushPromises()
    form.correction_type = 'punch_out'
    await flushPromises()
    await wrapper.get('.submit-btn').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      correction_type: 'punch_out',
      requested_punch_in: null,
      requested_punch_out: '2026-09-15T16:30:00',
    })
  })
})
