import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveForm from '@/parent/components/leaves/LeaveForm.vue'

const baseForm = {
  student_id: 10,
  leave_type: '病假',
  start_date: '2026-05-10',
  end_date: '2026-05-10',
  reason: '',
}
const children = [
  { student_id: 10, name: '王小明' },
  { student_id: 11, name: '王小華' },
]

describe('LeaveForm', () => {
  it('渲染學生選項與當前選擇', () => {
    const wrapper = mount(LeaveForm, {
      props: {
        modelValue: baseForm,
        children,
        pastLimit: '2025-01-01',
        futureLimit: '2027-01-01',
      },
    })
    const select = wrapper.find('#leave-student')
    expect(select.element.value).toBe('10')
    expect(wrapper.findAll('option').length).toBe(2)
    expect(wrapper.text()).toContain('王小明')
  })

  it('改學生 emit update:modelValue 帶新值', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    const select = wrapper.find('#leave-student')
    await select.setValue('11')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toEqual({ ...baseForm, student_id: 11 })
  })

  it('改假別 emit update:modelValue 帶新值', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    const radio = wrapper.find('input[type="radio"][value="事假"]')
    await radio.setValue()
    expect(wrapper.emitted('update:modelValue')[0][0].leave_type).toBe('事假')
  })

  it('改 textarea 原因 emit update:modelValue', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('#leave-reason').setValue('感冒')
    expect(wrapper.emitted('update:modelValue')[0][0].reason).toBe('感冒')
  })

  it('送出按鈕 click emit submit', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('.primary-btn').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('取消按鈕 click emit cancel', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('.secondary-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('submitting=true 時 primary-btn disabled + 顯示「送出中」', () => {
    const wrapper = mount(LeaveForm, {
      props: {
        modelValue: baseForm,
        children,
        pastLimit: '',
        futureLimit: '',
        submitting: true,
      },
    })
    const btn = wrapper.find('.primary-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('送出中')
  })
})
