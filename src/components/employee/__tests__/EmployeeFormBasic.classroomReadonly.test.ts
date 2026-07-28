// src/components/employee/__tests__/EmployeeFormBasic.classroomReadonly.test.ts
// 班級欄位唯讀化（2026-07-28）：Employee.classroom_id 唯一維護者是後端
// classroom_teacher_sync（班級頁指派老師時反算），員工表單手動選班級不會建立
// 真正的師生關聯、且會被下次班級異動無聲覆寫（staging 向日葵幼幼班回報）。
// 收斂後員工表單一律唯讀顯示，指派入口只留班級管理頁；PUT diff 不再送 classroom_id。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EmployeeFormBasic from '../EmployeeFormBasic.vue'
import { BASIC_TAB_FIELDS } from '@/constants/employeeFields'

const OPTIONS = [{ id: 5, name: '向日葵', grade_name: '幼幼班' }]

function mountForm(form: Record<string, unknown>, options = OPTIONS) {
  return mount(EmployeeFormBasic, {
    props: { form, classroomOptions: options },
    global: { plugins: [ElementPlus] },
  })
}

describe('EmployeeFormBasic 班級唯讀化', () => {
  it('班級一律唯讀顯示（不再出現下拉選單）', () => {
    const wrapper = mountForm({ classroom_id: 5 })
    const ro = wrapper.find('[data-test="classroom-readonly"]')
    expect(ro.exists()).toBe(true)
    expect(ro.text()).toContain('向日葵 (幼幼班)')
    expect(wrapper.html()).not.toContain('選擇班級')
  })

  it('未指派時顯示「未指派」與班級管理指派入口提示', () => {
    const wrapper = mountForm({ classroom_id: null })
    expect(wrapper.find('[data-test="classroom-readonly"]').text()).toContain('未指派')
    expect(wrapper.text()).toContain('班級管理')
  })

  it('options 未載入時 fallback 顯示後端算好的 classroom_name', () => {
    const wrapper = mountForm({ classroom_id: 9, classroom_name: '柚子 (中班)' }, [])
    expect(wrapper.find('[data-test="classroom-readonly"]').text()).toContain('柚子 (中班)')
  })

  it('BASIC_TAB_FIELDS 不含 classroom_id（dirty diff 不會把它送進 PUT）', () => {
    expect(BASIC_TAB_FIELDS).not.toContain('classroom_id')
  })
})
