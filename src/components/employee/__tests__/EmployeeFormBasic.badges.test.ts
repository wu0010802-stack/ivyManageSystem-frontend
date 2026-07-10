// src/components/employee/__tests__/EmployeeFormBasic.badges.test.ts
// FormSection 未填 n 項 info badge（finding #5 前半）：
// - n = 該區段欄位中空值（''/null/undefined）數量，即時隨 props.form 變動
// - n=0 不顯示 badge
// - 既有 sectionErrors（驗證失敗）error badge 優先於未填 info badge
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmployeeFormBasic from '../EmployeeFormBasic.vue'

// 只 stub 不影響 badge 判斷的 leaf 表單元件；FormSection 與 el-icon 保留真實實作，
// 因為 badge markup（.form-section__badge / is-info / is-error）就是 FormSection 渲染的。
const GLOBAL_STUBS = {
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input type="number" />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div><slot /></div>' },
  'el-date-picker': { template: '<input />' },
  'el-time-select': { template: '<input />' },
  'el-tag': { template: '<span><slot /></span>' },
}

function mountBasic(form: Record<string, unknown>) {
  return mount(EmployeeFormBasic, { props: { form }, global: { stubs: GLOBAL_STUBS } })
}

function badgeEl(wrapper: ReturnType<typeof mountBasic>, sectionTestId: string) {
  return wrapper.find(`[data-test="${sectionTestId}"] .form-section__badge`)
}

describe('EmployeeFormBasic 未填徽章', () => {
  it('jobDetail 4 欄全空 → info badge 顯示「4」', () => {
    const wrapper = mountBasic({})
    const badge = badgeEl(wrapper, 'section-jobDetail')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('4')
    expect(badge.classes()).toContain('is-info')
  })

  it('worktime 兩欄皆已填 → n=0，不顯示 badge', () => {
    const wrapper = mountBasic({ work_start_time: '08:00', work_end_time: '17:00' })
    expect(badgeEl(wrapper, 'section-worktime').exists()).toBe(false)
  })

  it('表單值變動時未填數即時更新（props.form 為 reactive 物件）', async () => {
    const form = { work_start_time: '', work_end_time: '' }
    const wrapper = mountBasic(form)
    expect(badgeEl(wrapper, 'section-worktime').text()).toBe('2')

    await wrapper.setProps({ form: { work_start_time: '08:00', work_end_time: '' } })
    expect(badgeEl(wrapper, 'section-worktime').text()).toBe('1')
  })

  it('applyValidationErrors 後：即使該區段仍有空欄位，error badge 優先於未填 info badge', async () => {
    const wrapper = mountBasic({}) // jobDetail 4 欄全空 → 未填 badge 本應顯示 4
    const vm = wrapper.vm as unknown as { applyValidationErrors: (props: string[]) => void }
    vm.applyValidationErrors(['position'])
    await wrapper.vm.$nextTick()

    const badge = badgeEl(wrapper, 'section-jobDetail')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1') // sectionErrors.jobDetail 計數，非未填計數 4
    expect(badge.classes()).toContain('is-error')
    expect(badge.classes()).not.toContain('is-info')
  })

  it('0 不誤判為未填：personal 區段 dependents=0 但其餘欄位皆填 → n=0', () => {
    const wrapper = mountBasic({
      birthday: '2000-01-01',
      id_number: 'A123456789',
      phone: '0912345678',
      email: 'a@b.com',
      address: '台北市',
      dependents: 0,
      emergency_contact_name: '王小明',
      emergency_contact_phone: '0987654321',
    })
    expect(badgeEl(wrapper, 'section-personal').exists()).toBe(false)
  })
})
