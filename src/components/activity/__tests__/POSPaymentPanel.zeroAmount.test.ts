import { describe, it, expect } from 'vitest'
import { defineComponent, computed, ref, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { ElInput, ElInputNumber } from 'element-plus'

import POSPaymentPanel from '../POSPaymentPanel.vue'

// FECASH-02：金額輸入框原本是 `el-input-number :min="1"`，Element Plus 會在
// `modelValue` 落在區間外時**立刻 clamp 並回寫**（verifyValue(value, true) →
// emit('update:modelValue', min)，見 element-plus input-number 對 props.modelValue
// 的 immediate watcher）。
//
// 於是 usePOSCheckout.ts 的退費 fail-closed 守衛（退費建議載入失敗 → amount_applied
// 歸 0 → canSubmit 為 false）在真實頁面上等於不存在：面板一掛上就把 0 回寫成 1，
// 父層 `@update:applied-amount="(v) => updateSelectedAmount(v ?? 0)"` 收下 1，
// 送出鈕解鎖 → 收銀員沒重看金額就會開出一張 NT$1 的退費收據。
//
// 這份測試刻意用**真實的 ElInputNumber**（不是 stub）：用 stub 測不到 clamp，
// 那正是原本單元測試在元件層假綠的原因。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

const PANEL_STUBS = {
  'el-card': slotStub(),
  'el-radio-group': slotStub(),
  'el-radio-button': slotStub('span'),
  'el-empty': true,
  'el-alert': slotStub(),
  'el-button': slotStub('button'),
}

function selectedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    student_name: '王小明',
    class_name: '大班',
    total_amount: 2000,
    paid_amount: 2000,
    owed: 0,
    amount_applied: 0,
    courses: [],
    supplies: [],
    ...overrides,
  }
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(POSPaymentPanel, {
    props: {
      itemTotal: 0,
      selectedItem: selectedItem(),
      canSubmit: false,
      submitting: false,
      checkoutType: 'refund',
      isRefundMode: true,
      ...props,
    },
    global: {
      components: { ElInput, ElInputNumber },
      stubs: PANEL_STUBS,
    },
  })
}

/**
 * 頁面組裝的最小重現：金額由面板的 `update:appliedAmount` 回寫（與
 * POSCheckoutPanel.vue 的 `(v) => updateSelectedAmount(v ?? 0)` 同語意），
 * canSubmit 依 usePOSCheckout.ts 的規則之一「applied <= 0 → false」計算。
 * 元件若把 0 clamp 成 1 並回寫，這個 harness 的送出鈕就會解鎖。
 */
const Harness = defineComponent({
  props: {
    isRefundMode: { type: Boolean, default: true },
    paidAmount: { type: Number, default: 2000 },
  },
  setup(props) {
    const amount = ref(0)
    // 與 usePOSCheckout.ts canSubmit 的金額條件同口徑（applied <= 0 一律擋）
    const canSubmit = computed(() => amount.value > 0)
    const item = computed(() =>
      selectedItem({ paid_amount: props.paidAmount, amount_applied: amount.value })
    )
    return () =>
      h(POSPaymentPanel, {
        itemTotal: amount.value,
        selectedItem: item.value,
        canSubmit: canSubmit.value,
        submitting: false,
        checkoutType: props.isRefundMode ? 'refund' : 'payment',
        isRefundMode: props.isRefundMode,
        notes: '家長申請退費，原因為課程時段衝突無法出席',
        'onUpdate:appliedAmount': (v: number | null) => {
          amount.value = v ?? 0
        },
      })
  },
})

function mountHarness(props: Record<string, unknown> = {}) {
  return mount(Harness, {
    props,
    global: {
      components: { ElInput, ElInputNumber },
      stubs: PANEL_STUBS,
    },
  })
}

function submitButton(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.find('.pos-payment__submit')
}

describe('POSPaymentPanel：金額 0 必須活得下來（FECASH-02）', () => {
  it('退費 fail-closed 的 0 不得被輸入框 clamp 回寫成 1', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const written = wrapper.emitted('update:appliedAmount') || []
    // 允許沒有任何回寫；若有，值必須仍是 0（不得憑空長出金額）
    for (const [v] of written as [number | null][]) {
      expect(v ?? 0).toBe(0)
    }
    expect(written.some(([v]) => Number(v) > 0)).toBe(false)
    wrapper.unmount()
  })

  it('收款模式的 0 同樣不得被 clamp 回寫成 1', async () => {
    const wrapper = mountPanel({
      checkoutType: 'payment',
      isRefundMode: false,
      selectedItem: selectedItem({ paid_amount: 0, owed: 2000, amount_applied: 0 }),
    })
    await nextTick()

    const written = wrapper.emitted('update:appliedAmount') || []
    expect(written.some(([v]) => Number(v) > 0)).toBe(false)
    wrapper.unmount()
  })

  it('canSubmit 為 false 時送出鈕 disabled（金額 0 按不下去）', async () => {
    const wrapper = mountPanel({ canSubmit: false })
    await nextTick()
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('整頁組裝：退費金額停在 0，送出鈕維持 disabled', async () => {
    const wrapper = mountHarness({ isRefundMode: true })
    await nextTick()
    await nextTick()

    const btn = wrapper.find('.pos-payment__submit')
    expect(btn.attributes('disabled')).toBeDefined()
    // 面板顯示的金額也必須還是 0（沒有被偷偷改成 1）
    expect(wrapper.findComponent(POSPaymentPanel).props('itemTotal')).toBe(0)
    wrapper.unmount()
  })

  it('整頁組裝：收款金額停在 0，送出鈕維持 disabled', async () => {
    const wrapper = mountHarness({ isRefundMode: false, paidAmount: 0 })
    await nextTick()
    await nextTick()

    expect(wrapper.find('.pos-payment__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(POSPaymentPanel).props('itemTotal')).toBe(0)
    wrapper.unmount()
  })

  it('使用者手動輸入正常金額後仍可送出（0 守衛不是把輸入框鎖死）', async () => {
    const wrapper = mountHarness({ isRefundMode: true })
    await nextTick()

    const input = wrapper.find('input')
    await input.setValue('1500')
    await input.trigger('change')
    await nextTick()

    expect(wrapper.findComponent(POSPaymentPanel).props('itemTotal')).toBe(1500)
    expect(wrapper.find('.pos-payment__submit').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('退費金額仍不得超過已繳（上限守衛未因 min 改動而失效）', async () => {
    const wrapper = mountHarness({ isRefundMode: true, paidAmount: 800 })
    await nextTick()

    const input = wrapper.find('input')
    await input.setValue('9999')
    await input.trigger('change')
    await nextTick()

    expect(wrapper.findComponent(POSPaymentPanel).props('itemTotal')).toBe(800)
    wrapper.unmount()
  })
})
