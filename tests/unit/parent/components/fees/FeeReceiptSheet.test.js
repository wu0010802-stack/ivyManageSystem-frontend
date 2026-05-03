import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeReceiptSheet from '@/parent/components/fees/FeeReceiptSheet.vue'

const stubs = { ParentIcon: true, teleport: true }

const sampleRecord = {
  id: 1,
  fee_item_name: '5 月學費',
  period: '2026-05',
  student_name: '王小明',
  amount_due: 8000,
  amount_paid: 8000,
}

const samplePayments = [
  { payment_date: '2026-05-03', payment_method: '匯款', amount: 8000, receipt_no: 'R-20260503-001' },
]

const sampleRefunds = [
  { refunded_at: '2026-05-04T10:00:00', reason: '溢繳退款', amount: 200 },
]

describe('FeeReceiptSheet', () => {
  it('modelValue=true 時顯示 record / payments / refunds', () => {
    const wrapper = mount(FeeReceiptSheet, {
      props: {
        modelValue: true,
        record: sampleRecord,
        payments: samplePayments,
        refunds: sampleRefunds,
      },
      global: { stubs },
    })
    const text = wrapper.text()
    expect(text).toContain('5 月學費')
    expect(text).toContain('2026-05')
    expect(text).toContain('匯款')
    expect(text).toContain('+$8,000')
    expect(text).toContain('收據 R-20260503-001')
    expect(text).toContain('退款紀錄')
    expect(text).toContain('-$200')
  })

  it('複製收據資訊按鈕 emit copy-info 並帶 record + payments', async () => {
    const wrapper = mount(FeeReceiptSheet, {
      props: {
        modelValue: true,
        record: sampleRecord,
        payments: samplePayments,
      },
      global: { stubs },
    })
    const buttons = wrapper.findAll('.action-btn')
    await buttons[0].trigger('click')
    expect(wrapper.emitted('copy-info')).toBeTruthy()
    expect(wrapper.emitted('copy-info')[0][0]).toEqual(sampleRecord)
    expect(wrapper.emitted('copy-info')[0][1]).toEqual(samplePayments)
  })

  it('受款編號存在時複製編號鈕 emit copy-no；不存在時不渲染', async () => {
    const wrapperWith = mount(FeeReceiptSheet, {
      props: {
        modelValue: true,
        record: sampleRecord,
        payments: samplePayments,
      },
      global: { stubs },
    })
    const btns = wrapperWith.findAll('.action-btn')
    expect(btns).toHaveLength(2)
    await btns[1].trigger('click')
    expect(wrapperWith.emitted('copy-no')[0][0]).toBe('R-20260503-001')

    const wrapperWithout = mount(FeeReceiptSheet, {
      props: {
        modelValue: true,
        record: sampleRecord,
        payments: [{ payment_date: '2026-05-03', payment_method: '現金', amount: 100 }],
      },
      global: { stubs },
    })
    expect(wrapperWithout.findAll('.action-btn')).toHaveLength(1)
  })
})
