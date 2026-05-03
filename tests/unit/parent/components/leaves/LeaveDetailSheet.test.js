import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveDetailSheet from '@/parent/components/leaves/LeaveDetailSheet.vue'

const stubs = { ParentIcon: true, teleport: true }
const sample = {
  id: 1,
  student_id: 10,
  leave_type: '事假',
  start_date: '2026-05-10',
  end_date: '2026-05-11',
  reason: '出國',
  status: 'approved',
}
const resolver = (a) => `/api/files/${a.id}`

describe('LeaveDetailSheet', () => {
  it('modelValue=false 時不顯示 sheet', () => {
    const wrapper = mount(LeaveDetailSheet, {
      props: { modelValue: false, leave: sample, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('modelValue=true 時顯示 leave 標題與基本資訊', () => {
    const wrapper = mount(LeaveDetailSheet, {
      props: { modelValue: true, leave: sample, studentName: '王小明', urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('事假 申請')
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('2026-05-10')
    expect(wrapper.text()).toContain('出國')
  })

  it('studentName 缺失時顯示 fallback「—」', () => {
    const wrapper = mount(LeaveDetailSheet, {
      props: { modelValue: true, leave: sample, urlResolver: resolver },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('—')
  })

  it('timelineSteps 渲染 step + done class', () => {
    const wrapper = mount(LeaveDetailSheet, {
      props: {
        modelValue: true,
        leave: sample,
        urlResolver: resolver,
        timelineSteps: [
          { key: 'submitted', label: '已送出', done: true, timestamp: '2026-05-01T10:00:00' },
          { key: 'reviewed', label: '校方審核', done: false },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('已送出')
    expect(wrapper.text()).toContain('校方審核')
    expect(wrapper.text()).toContain('2026-05-01 10:00')
    const steps = wrapper.findAll('.step')
    expect(steps[0].classes()).toContain('done')
    expect(steps[1].classes()).not.toContain('done')
  })

  it('att-upload / att-remove 由 LeaveAttachments emit 後轉發', async () => {
    const wrapper = mount(LeaveDetailSheet, {
      props: {
        modelValue: true,
        leave: { ...sample, attachments: [{ id: 1, original_filename: 'x.pdf' }] },
        attEditable: true,
        urlResolver: resolver,
      },
      global: { stubs },
    })
    await wrapper.find('.att-del').trigger('click')
    expect(wrapper.emitted('att-remove')[0][0]).toEqual({ id: 1, original_filename: 'x.pdf' })

    const input = wrapper.find('input[type="file"]')
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(wrapper.emitted('att-upload')[0][0]).toBe(file)
  })
})
