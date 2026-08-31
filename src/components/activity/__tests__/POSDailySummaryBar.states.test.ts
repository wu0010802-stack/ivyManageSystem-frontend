import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSDailySummaryBar from '../POSDailySummaryBar.vue'

// POS code review 2026-08-15：
//
// P3-04：後端 daily-summary 早已回 is_approved，前端完全不消費——該日已日結時
//   櫃台照舊按收款，直到後端 400 才知道。已日結必須在彙總條上就講清楚。
//
// P3-05：刷新失敗時 data 為 null，而彙總條用 `?? 0` 把它顯示成 NT$0。
//   「沒資料」與「今天真的是零」在收銀場景是兩件事——點鈔對帳會直接被誤導。
//   無資料一律顯示「—」，並在刷新失敗時顯示可見的錯誤與重試。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })
// el-alert 的文案掛在具名 title slot，stub 必須把它渲染出來才驗得到
const alertStub = { template: '<div><slot name="title" /><slot /></div>' }

const SUMMARY = {
  payment_total: 12000,
  refund_total: 500,
  net: 11500,
  payment_count: 8,
  refund_count: 1,
  is_approved: false,
  cash_warning: false,
}

function mountBar(props: Record<string, unknown> = {}) {
  return mount(POSDailySummaryBar, {
    props,
    global: {
      stubs: {
        'el-alert': alertStub,
        'el-button': slotStub('button'),
        StatCard: {
          props: ['label', 'value'],
          template: '<div class="stat-card">{{ label }}:{{ value }}</div>',
        },
      },
    },
  })
}

describe('POSDailySummaryBar 已日結提示（P3-04）', () => {
  it('is_approved 為 true 時顯示醒目提示', () => {
    const wrapper = mountBar({ data: { ...SUMMARY, is_approved: true } })
    const alert = wrapper.get('.pos-daily-bar__approved-alert')
    expect(alert.text()).toContain('已日結')
    expect(alert.text()).toContain('收款')
  })

  it('未日結時不顯示該提示', () => {
    const wrapper = mountBar({ data: SUMMARY })
    expect(wrapper.find('.pos-daily-bar__approved-alert').exists()).toBe(false)
  })
})

describe('POSDailySummaryBar 無資料與錯誤態（P3-05）', () => {
  it('data 為 null 時金額顯示「—」而非 NT$0', () => {
    const wrapper = mountBar({ data: null })
    const text = wrapper.text()
    expect(text).not.toContain('NT$0')
    expect(text).toContain('—')
  })

  it('刷新失敗時顯示錯誤提示與重試鈕，點擊會 emit retry', async () => {
    const wrapper = mountBar({ data: null, error: true })
    expect(wrapper.get('.pos-daily-bar__error-alert').text()).toContain('日結彙總載入失敗')

    await wrapper.get('.pos-daily-bar__retry').trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
  })

  it('有資料時正常顯示金額', () => {
    const wrapper = mountBar({ data: SUMMARY })
    expect(wrapper.text()).toContain('NT$12,000')
    expect(wrapper.find('.pos-daily-bar__error-alert').exists()).toBe(false)
  })
})
