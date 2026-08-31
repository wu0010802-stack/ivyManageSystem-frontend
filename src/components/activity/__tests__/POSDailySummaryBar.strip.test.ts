import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSDailySummaryBar from '../POSDailySummaryBar.vue'

// POS 儀表板 2026-08-17 改版：四張 icon tonal 卡片改為單一 StatStrip 統計列。
// 守衛三件事：① 不再渲染任何裝飾 icon ② 退款只在 > 0 時上警示色
// ③ 淨額是唯一視覺錨點（--em）。
// P3-04/P3-05 的 alert 與「—」缺值行為由 POSDailySummaryBar.states.test.ts 守。

const SUMMARY = {
  payment_total: 17003,
  refund_total: 0,
  net: 17003,
  payment_count: 1,
  refund_count: 0,
  is_approved: false,
  cash_warning: false,
}

function mountBar(data: Record<string, unknown> | null) {
  return mount(POSDailySummaryBar, {
    props: { data: data as never },
    global: {
      stubs: { 'el-alert': true },
    },
  })
}

describe('POSDailySummaryBar 統計列', () => {
  it('渲染四格統計且不含任何 icon', () => {
    const wrapper = mountBar(SUMMARY)

    const cells = wrapper.findAll('.stat-strip__cell')
    expect(cells).toHaveLength(4)
    expect(wrapper.text()).toContain('NT$17,003')
    expect(wrapper.text()).toContain('1 / 0')
    expect(wrapper.find('.el-icon').exists()).toBe(false)
    expect(wrapper.find('.stat-card').exists()).toBe(false)
  })

  it('退款為 0 時不上色；退款 > 0 時套 warning 色', () => {
    const zero = mountBar(SUMMARY)
    expect(zero.find('.stat-strip__value--warning').exists()).toBe(false)

    const withRefund = mountBar({ ...SUMMARY, refund_total: 50, net: 16953 })
    const warning = withRefund.get('.stat-strip__value--warning')
    expect(warning.text()).toContain('NT$50')
  })

  it('無資料（—）時退款不上色', () => {
    const wrapper = mountBar(null)
    expect(wrapper.find('.stat-strip__value--warning').exists()).toBe(false)
    expect(wrapper.text()).toContain('—')
  })

  it('淨額是唯一的視覺錨點（--em）', () => {
    const wrapper = mountBar(SUMMARY)
    const anchors = wrapper.findAll('.stat-strip__value--em')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].text()).toContain('NT$17,003')
  })
})
