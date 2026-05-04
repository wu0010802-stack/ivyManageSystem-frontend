import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeHero from '@/parent/components/fees/FeeHero.vue'

describe('FeeHero', () => {
  it('顯示未繳大數字、最近到期、逾期警示', () => {
    const wrapper = mount(FeeHero, {
      props: {
        unpaidTotal: 12500,
        unpaidCount: 3,
        nearestDueDate: '2026-05-10',
        overdueAmount: 4200,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('12,500')
    expect(text).toContain('NT$')
    expect(text).toContain('2026-05-10')
    expect(text).toContain('共 3 筆')
    expect(text).toContain('已逾期 NT$ 4,200')
  })

  it('unpaidCount=0 時隱藏 CTA 與最近到期行', () => {
    const wrapper = mount(FeeHero, {
      props: {
        unpaidTotal: 0,
        unpaidCount: 0,
        nearestDueDate: '2026-05-10',
        overdueAmount: 0,
      },
    })
    expect(wrapper.find('.fee-hero-cta').exists()).toBe(false)
    expect(wrapper.find('.fee-hero-due').exists()).toBe(false)
    expect(wrapper.find('.fee-hero-overdue').exists()).toBe(false)
  })

  it('CTA 點擊 emit jump-unpaid', async () => {
    const wrapper = mount(FeeHero, {
      props: { unpaidTotal: 100, unpaidCount: 1 },
    })
    await wrapper.find('.fee-hero-cta').trigger('click')
    expect(wrapper.emitted('jump-unpaid')).toBeTruthy()
    expect(wrapper.emitted('jump-unpaid')).toHaveLength(1)
  })
})
