import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityRegisterSheet from '@/parent/components/activity/ActivityRegisterSheet.vue'

const stubs = { ParentIcon: true, teleport: true }

const children = [
  { student_id: 1, name: '王小明' },
  { student_id: 2, name: '陳小華' },
]

const availableCourses = [
  { id: 100, name: '繪畫', price: 3000, is_full: false, allow_waitlist: true },
  { id: 101, name: '足球', price: 4500, is_full: true, allow_waitlist: true },
]

const baseForm = { student_id: 1, school_year: 113, semester: 1, course_ids: [] }

describe('ActivityRegisterSheet', () => {
  it('開啟時顯示學生 select 與課程 checkbox', () => {
    const wrapper = mount(ActivityRegisterSheet, {
      props: {
        modelValue: true,
        formData: baseForm,
        children,
        availableCourses,
      },
      global: { stubs },
    })
    const text = wrapper.text()
    expect(text).toContain('王小明')
    expect(text).toContain('陳小華')
    expect(text).toContain('繪畫')
    expect(text).toContain('足球')
    expect(text).toContain('已額滿（候補）')
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
  })

  it('勾選課程 emit update:form-data 帶完整 form', async () => {
    const wrapper = mount(ActivityRegisterSheet, {
      props: {
        modelValue: true,
        formData: baseForm,
        children,
        availableCourses,
      },
      global: { stubs },
    })
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].trigger('change')
    const ev = wrapper.emitted('update:form-data')
    expect(ev).toBeTruthy()
    expect(ev[0][0]).toEqual({
      student_id: 1,
      school_year: 113,
      semester: 1,
      course_ids: [100],
    })
  })

  it('送出按鈕 emit submit；取消按鈕 emit update:modelValue=false', async () => {
    const wrapper = mount(ActivityRegisterSheet, {
      props: {
        modelValue: true,
        formData: baseForm,
        children,
        availableCourses,
      },
      global: { stubs },
    })
    const buttons = wrapper.findAll('button')
    const cancel = buttons.find((b) => b.text().includes('取消'))
    const submit = buttons.find((b) => b.text().includes('送出'))
    await submit.trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    await cancel.trigger('click')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })
})
