import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/api/activityPublic', () => ({
  publicCreateInquiry: vi.fn(),
}))

import ContactInquiryModal from '../ContactInquiryModal.vue'

describe('ContactInquiryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('空白送出時顯示欄位旁錯誤並聚焦第一欄', async () => {
    const wrapper = mount(ContactInquiryModal, {
      props: { visible: true },
      attachTo: document.body,
    })

    await wrapper.get('button[type="submit"]').trigger('submit')
    await wrapper.vm.$nextTick()

    const nameInput = wrapper.get('#contactName')
    expect(nameInput.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#contactName-err').text()).toContain('姓名')
    expect(document.activeElement).toBe(nameInput.element)

    wrapper.unmount()
  })

  it('送出成功後關閉視窗', async () => {
    const { publicCreateInquiry } = await import('@/api/activityPublic')
    vi.mocked(publicCreateInquiry).mockResolvedValue({
      data: { message: '已收到提問' },
    } as never)

    const wrapper = mount(ContactInquiryModal, {
      props: { visible: true },
    })

    await wrapper.get('#contactName').setValue('王家長')
    await wrapper.get('#contactPhone').setValue('0912345678')
    await wrapper.get('#contactQuestion').setValue('請問上課時間？')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('update:visible')).toContainEqual([false])
    wrapper.unmount()
  })

  it('接受後端契約允許的市話', async () => {
    const { publicCreateInquiry } = await import('@/api/activityPublic')
    vi.mocked(publicCreateInquiry).mockResolvedValue({
      data: { message: '已收到提問' },
    } as never)

    const wrapper = mount(ContactInquiryModal, {
      props: { visible: true },
    })

    await wrapper.get('#contactName').setValue('王家長')
    await wrapper.get('#contactPhone').setValue('07-1234567')
    await wrapper.get('#contactQuestion').setValue('請問上課時間？')
    await wrapper.get('form').trigger('submit')

    expect(publicCreateInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '07-1234567' }),
    )
    expect(wrapper.find('#contactPhone-err').exists()).toBe(false)
    wrapper.unmount()
  })
})
