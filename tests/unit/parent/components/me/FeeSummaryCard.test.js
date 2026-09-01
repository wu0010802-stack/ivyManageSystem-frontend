import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeSummaryCard from '@/parent/components/me/FeeSummaryCard.vue'

const stubs = {
  'router-link': {
    template: '<a :data-to="to"><slot /></a>',
    props: ['to'],
  },
}

describe('FeeSummaryCard', () => {
  it('顯示應繳餘額與逾期金額', () => {
    const wrapper = mount(FeeSummaryCard, {
      props: { outstanding: 12500, overdue: 3200 },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('12,500')
    expect(wrapper.html()).toContain('3,200')
    expect(wrapper.find('.fee-overdue').exists()).toBe(true)
  })

  it('overdue=0 時不顯示逾期區塊', () => {
    const wrapper = mount(FeeSummaryCard, {
      props: { outstanding: 5000, overdue: 0 },
      global: { stubs },
    })
    expect(wrapper.find('.fee-overdue').exists()).toBe(false)
  })

  it('outstanding=0 顯示「無待繳」狀態', () => {
    const wrapper = mount(FeeSummaryCard, {
      props: { outstanding: 0, overdue: 0 },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('目前無待繳')
  })

  // 2026-09-01 起收斂為單一入口：原「查看明細／繳費紀錄」兩鈕連到同一
  // /fees 是假選擇（詳見 src/parent/components/me/__tests__/FeeSummaryCard.test.ts）
  it('只提供單一 CTA，預設連到 /fees', () => {
    const wrapper = mount(FeeSummaryCard, {
      props: { outstanding: 100, overdue: 0 },
      global: { stubs },
    })
    const links = wrapper.findAll('a')
    expect(links.length).toBe(1)
    expect(links[0].attributes('data-to')).toBe('/fees')
  })

  it('passes through custom detailHref prop', () => {
    const wrapper = mount(FeeSummaryCard, {
      props: { outstanding: 100, overdue: 0, detailHref: '/fees/123' },
      global: { stubs },
    })
    const links = wrapper.findAll('a')
    expect(links[0].attributes('data-to')).toBe('/fees/123')
  })
})
