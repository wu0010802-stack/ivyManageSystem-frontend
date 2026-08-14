import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import POSPaymentPanel from '../POSPaymentPanel.vue'

// POS code review 2026-08-15：
//
// P2-10：本次收取的 el-input-number `:max` 寫死 999999，與該筆應繳完全無關，
//   超收也沒有任何提示。⚠ 後端不擋超收是業主 2026-06-23 明確裁定，因此**不可**
//   加硬性阻擋——只加軟提示：超過應繳時在輸入框下方顯示溢繳警示並把輸入框描邊改警示色。
//
// P2-11：退費卡背景寫死 `linear-gradient(180deg, #fff1f1 0%, #ffffff 15%)`，深色模式
//   無覆寫 → 亮字疊在白底上，退費金額與按鈕幾乎讀不到。改用 design token。
//   `.pos-payment__selected-dot` 的 `#6366f1` 同理。
//
// P3-07：退費建議試算期間 canSubmit 為 false（送出鈕 disable），但該旗標從未下傳到
//   面板，櫃台只看到按鈕變灰、沒有任何原因。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

const SELECTED = {
  id: 42,
  student_name: '王小明',
  class_name: '大班',
  total_amount: 2000,
  paid_amount: 500,
  owed: 1500,
  amount_applied: 1500,
  courses: [],
  supplies: [],
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(POSPaymentPanel, {
    props: {
      itemTotal: 1500,
      selectedItem: SELECTED,
      canSubmit: true,
      submitting: false,
      ...overrides,
    },
    global: {
      stubs: {
        'el-card': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-empty': true,
        'el-input': true,
        'el-input-number': true,
        'el-alert': slotStub(),
        'el-button': slotStub('button'),
      },
    },
  })
}

describe('POSPaymentPanel 溢繳軟提示（P2-10）', () => {
  it('本次收取未超過應繳時不顯示溢繳提示', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.pos-payment__overpay-hint').exists()).toBe(false)
  })

  it('超過應繳時顯示溢繳金額提示，並把輸入框描邊改警示色', () => {
    const wrapper = mountPanel({
      itemTotal: 2000,
      selectedItem: { ...SELECTED, amount_applied: 2000 },
    })

    const hint = wrapper.get('.pos-payment__overpay-hint')
    expect(hint.text()).toContain('超過應繳')
    expect(hint.text()).toContain('NT$500')
    expect(hint.text()).toContain('溢繳')

    expect(wrapper.get('.pos-payment__applied-input').classes()).toContain(
      'pos-payment__applied-input--overpay'
    )
  })

  it('不得把超收改成硬性阻擋：input 的 max 不再夾在應繳金額', () => {
    const wrapper = mountPanel({
      itemTotal: 2000,
      selectedItem: { ...SELECTED, amount_applied: 2000 },
    })
    const max = Number(wrapper.get('.pos-payment__applied-input').attributes('max'))
    expect(max).toBeGreaterThan(1500)
  })

  it('退費模式不套用溢繳提示（退費上限另有 paid_amount 夾住）', () => {
    const wrapper = mountPanel({
      isRefundMode: true,
      itemTotal: 500,
      selectedItem: { ...SELECTED, amount_applied: 500 },
    })
    expect(wrapper.find('.pos-payment__overpay-hint').exists()).toBe(false)
  })
})

describe('POSPaymentPanel 退費建議試算可見性（P3-07）', () => {
  it('試算中時金額列顯示「退費建議試算中…」', () => {
    const wrapper = mountPanel({
      isRefundMode: true,
      refundSuggestionLoading: true,
      canSubmit: false,
    })
    expect(wrapper.text()).toContain('退費建議試算中')
  })

  it('未在試算時不顯示該字樣', () => {
    const wrapper = mountPanel({ isRefundMode: true, refundSuggestionLoading: false })
    expect(wrapper.text()).not.toContain('退費建議試算中')
  })
})

describe('POSPaymentPanel 深色模式可讀性（P2-11）', () => {
  const source = readFileSync(resolve(__dirname, '../POSPaymentPanel.vue'), 'utf-8')
  const styleBlock = source.slice(source.indexOf('<style'))

  it('退費卡背景不得寫死 hex（深色模式無覆寫 → 亮字疊白底）', () => {
    expect(styleBlock).not.toMatch(/#fff1f1/i)
    expect(styleBlock).not.toMatch(/#ffffff/i)
  })

  it('退費卡背景改用 design token', () => {
    const rule = styleBlock.match(
      /\.pos-panel--refund :deep\(\.el-card__body\)\s*\{([^}]*)\}/
    )
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/var\(--color-danger-soft\)/)
    expect(rule![1]).toMatch(/var\(--surface-color\)/)
  })

  it('課程項目圓點不得寫死 indigo hex', () => {
    expect(styleBlock).not.toMatch(/#6366f1/i)
    const rule = styleBlock.match(/\.pos-payment__selected-dot\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/background:\s*var\(--/)
  })
})
