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
})
