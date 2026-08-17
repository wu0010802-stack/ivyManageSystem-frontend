import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSPaymentPanel from '../POSPaymentPanel.vue'

// ②收款以「確認收款」為主（2026-08-16）：主流程只留一顆送出鈕，不再自動列印；
// 輸入金額與應收不一致時給差額提示（分期收款仍是合法情境，不阻擋送出）。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function selectedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    student_name: '王小明',
    class_name: '大班',
    total_amount: 2000,
    paid_amount: 0,
    owed: 2000,
    amount_applied: 2000,
    courses: [],
    supplies: [],
    ...overrides,
  }
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(POSPaymentPanel, {
    props: {
      itemTotal: 2000,
      selectedItem: selectedItem(),
      canSubmit: true,
      submitting: false,
      checkoutType: 'payment',
      isRefundMode: false,
      ...props,
    },
    global: {
      stubs: {
        'el-card': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-empty': true,
        'el-input-number': true,
        'el-input': true,
        'el-alert': slotStub(),
        'el-button': slotStub('button'),
      },
    },
  })
}

describe('POSPaymentPanel：單一確認收款鈕', () => {
  it('只有一顆送出鈕，文案為「確認收款」，不再出現「並列印」', () => {
    const wrapper = mountPanel()
    const text = wrapper.text()
    expect(text).toContain('確認收款')
    expect(text).not.toContain('並列印')
    expect(text).not.toContain('只確認收款')
  })

  it('退費模式送出鈕文案為「確認退費」，同樣不含「並列印」', () => {
    const wrapper = mountPanel({
      isRefundMode: true,
      checkoutType: 'refund',
      selectedItem: selectedItem({ amount_applied: 2000, paid_amount: 2000 }),
    })
    const text = wrapper.text()
    expect(text).toContain('確認退費')
    expect(text).not.toContain('並列印')
  })

  it('送出時 emit submit 不帶 print 旗標（呼叫端不再區分列印與否）', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.pos-payment__submit').trigger('click')
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]?.[0]).toBeUndefined()
  })
})

describe('POSPaymentPanel：應收差額提示', () => {
  it('本次收取金額小於應收時顯示差額提示', () => {
    const wrapper = mountPanel({
      selectedItem: selectedItem({ amount_applied: 1500, owed: 2000, total_amount: 2000, paid_amount: 0 }),
    })
    expect(wrapper.text()).toContain('與應收差')
  })

  it('金額等於應收時不顯示差額提示', () => {
    const wrapper = mountPanel({
      selectedItem: selectedItem({ amount_applied: 2000, owed: 2000, total_amount: 2000, paid_amount: 0 }),
    })
    expect(wrapper.text()).not.toContain('與應收差')
  })

  it('退費模式不顯示應收差額提示', () => {
    const wrapper = mountPanel({
      isRefundMode: true,
      checkoutType: 'refund',
      selectedItem: selectedItem({ amount_applied: 1000, paid_amount: 2000, total_amount: 2000 }),
    })
    expect(wrapper.text()).not.toContain('與應收差')
  })
})
