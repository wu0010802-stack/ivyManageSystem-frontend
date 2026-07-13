import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BasicSection from '../BasicSection.vue'

const mountSection = (employee: Record<string, unknown>) =>
  mount(BasicSection, { props: { employee }, global: { plugins: [ElementPlus] } })

describe('BasicSection 空值顯示', () => {
  it('空欄位顯示淡灰「未填寫」（crisp-empty）', () => {
    const w = mountSection({ phone: '', email: null })
    const empties = w.findAll('.crisp-empty')
    expect(empties.length).toBeGreaterThan(0)
    expect(empties[0].text()).toBe('未填寫')
  })
  it('有值欄位正常顯示、不帶 crisp-empty', () => {
    const w = mountSection({ phone: '0912-345-678' })
    expect(w.text()).toContain('0912-345-678')
    const phoneCell = w.findAll('span').find((s) => s.text() === '0912-345-678')
    expect(phoneCell!.classes()).not.toContain('crisp-empty')
  })
  it('眷屬人數 0 是有效值，不顯示未填寫', () => {
    const w = mountSection({ dependents: 0 })
    expect(w.text()).not.toContain('眷屬人數未填寫')
    const zeroCell = w.findAll('span').find((s) => s.text() === '0')
    expect(zeroCell).toBeTruthy()
    expect(zeroCell!.classes()).not.toContain('crisp-empty')
  })
})
