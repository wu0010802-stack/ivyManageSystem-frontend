import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveAttachments from '@/parent/components/leaves/LeaveAttachments.vue'

const stubs = { ParentIcon: true }

describe('LeaveAttachments', () => {
  const sample = [
    { id: 1, original_filename: 'a.pdf' },
    { id: 2, original_filename: null },
  ]
  const resolver = (a) => `/api/files/${a.id}`

  it('editable=false 顯示說明 hint，不顯示上傳/刪除', () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: sample, editable: false, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.find('.detail-hint').exists()).toBe(true)
    expect(wrapper.find('.upload-btn').exists()).toBe(false)
    expect(wrapper.find('.att-del').exists()).toBe(false)
  })

  it('editable=true 顯示上傳按鈕與每筆刪除', () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: sample, editable: true, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.find('.upload-btn').exists()).toBe(true)
    expect(wrapper.findAll('.att-del').length).toBe(2)
  })

  it('list 為空時顯示 att-empty', () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: [], editable: true, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.find('.att-empty').exists()).toBe(true)
  })

  it('附件 fallback filename 使用 #id', () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: [{ id: 7, original_filename: '' }], editable: false, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('附件 #7')
  })

  it('刪除按鈕 click emit remove(att)', async () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: sample, editable: true, urlResolver: resolver },
      global: { stubs },
    })
    await wrapper.find('.att-del').trigger('click')
    expect(wrapper.emitted('remove')[0][0]).toEqual(sample[0])
  })

  it('檔案選擇 emit upload(file)', async () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: [], editable: true, urlResolver: resolver },
      global: { stubs },
    })
    const input = wrapper.find('input[type="file"]')
    const file = new File(['hello'], 'x.pdf', { type: 'application/pdf' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(wrapper.emitted('upload')[0][0]).toBe(file)
  })

  it('uploading=true 鎖 input', () => {
    const wrapper = mount(LeaveAttachments, {
      props: { attachments: [], editable: true, uploading: true, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.find('input[type="file"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('上傳中')
  })
})
