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
  { id: 102, name: '陶藝', price: 2000, is_full: true, allow_waitlist: false },
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
    expect(checkboxes).toHaveLength(3)
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

  it('conflictIds 含某課 id → 該課顯示時段衝突提示（advisory，不停用 checkbox）', () => {
    const wrapper = mount(ActivityRegisterSheet, {
      props: {
        modelValue: true,
        formData: baseForm,
        children,
        availableCourses,
        conflictIds: new Set([101]),
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('時段衝突')
    // advisory：衝堂課（101 足球，is_full 但 allow_waitlist=true → 未鎖）checkbox 仍可勾選（不 disabled）
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    // 第 1 個（index 1）為衝堂課 101，須維持可勾選
    expect(checkboxes[1].attributes('disabled')).toBeUndefined()
  })

  it('滿額且不開放候補課（陶藝 102）checkbox 應 disabled，且 toggle 不改 formData', async () => {
    const wrapper = mount(ActivityRegisterSheet, {
      props: {
        modelValue: true,
        formData: baseForm,
        children,
        availableCourses,
      },
      global: { stubs },
    })
    // 文字標籤標示「已額滿・恕不開放候補」
    expect(wrapper.text()).toContain('恕不開放候補')
    // 陶藝為第 3 個（index 2）checkbox，須 disabled
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes[2].attributes('disabled')).toBeDefined()
    // toggle 不改 formData（守衛 early-return；瀏覽器 disabled 不觸發 change，
    // 但守衛是防呆雙保險，直接呼叫 toggleCourse 驗證）
    wrapper.vm.toggleCourse(102)
    await wrapper.vm.$nextTick()
    const ev = wrapper.emitted('update:form-data')
    expect(ev).toBeFalsy()
  })

  it('未傳 conflictIds → 無衝堂提示（向後相容）', () => {
    const wrapper = mount(ActivityRegisterSheet, {
      props: {
        modelValue: true,
        formData: baseForm,
        children,
        availableCourses,
      },
      global: { stubs },
    })
    expect(wrapper.text()).not.toContain('時段衝突')
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
