import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EmployeeFormBasic from '@/components/employee/EmployeeFormBasic.vue'

function mountForm() {
  return mount(EmployeeFormBasic, {
    global: { plugins: [ElementPlus] },
    props: { form: { name: '', employee_id: '' } },
  })
}

describe('EmployeeFormBasic', () => {
  it('員工編號呈現為唯讀自動配號提示、非輸入框', () => {
    const wrapper = mountForm()
    const auto = wrapper.find('[data-test="employee-id-auto"]')
    expect(auto.exists()).toBe(true)
    expect(auto.text()).toContain('自動配號')
  })

  it('收合區段內欄位預設不可見', () => {
    const wrapper = mountForm()
    expect(wrapper.text()).not.toContain('教保身分別')
  })

  it('applyValidationErrors 會展開含錯區段並設徽章', async () => {
    const wrapper = mountForm()
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void })
      .applyValidationErrors(['teacher_cert_no'])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('教保身分別')
  })

  it('isSelfEdit=true 時薪資敏感欄位（含收合區的職位）呈現唯讀鎖頭', async () => {
    const wrapper = mount(EmployeeFormBasic, {
      global: { plugins: [ElementPlus] },
      props: { form: { name: '王', position: '園長', job_title_id: 1 }, isSelfEdit: true },
    })
    // 核心區鎖定欄位立即唯讀
    expect(wrapper.find('.readonly-text').exists()).toBe(true)
    // 展開職務細節後，position 也唯讀（顯示值，非可編輯）
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void })
      .applyValidationErrors(['position'])
    await wrapper.vm.$nextTick()
    const locked = wrapper.findAll('.readonly-text')
    expect(locked.some(n => n.text().includes('園長'))).toBe(true)
  })

  it('applyValidationErrors 設定該區徽章數', async () => {
    const wrapper = mount(EmployeeFormBasic, {
      global: { plugins: [ElementPlus] },
      props: { form: { name: '' } },
    })
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void })
      .applyValidationErrors(['teacher_cert_no'])
    await wrapper.vm.$nextTick()
    const badge = wrapper.find('.form-section__badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
  })
})
