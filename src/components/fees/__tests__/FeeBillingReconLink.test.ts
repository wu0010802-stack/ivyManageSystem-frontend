/**
 * 帳單×對帳資料打通（SPEC-014 §16）前端顯示：
 *
 * - settlementDisplay：五桶 → tag 的對照與過濾（金額 0 不顯示）、逐桶加總
 * - BillingCodeCell：末四碼顯示、點擊展開完整 14 碼＋複製、無配置顯示 '—'
 * - FeeMonthlyStatement：銷帳碼欄、收款確認彙總列（scope 內逐項加總）、
 *   展開明細的逐項確認 tag
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import {
  activeSettlementTags,
  sumSettlements,
  type FeeSettlement,
} from '@/components/fees/settlementDisplay'
import BillingCodeCell from '@/components/fees/BillingCodeCell.vue'

const settlement = (over: Partial<FeeSettlement> = {}): FeeSettlement => ({
  cash_registered: 0,
  cash_submitted: 0,
  cash_confirmed: 0,
  bank_reconciled: 0,
  unreceipted: 0,
  ...over,
})

describe('settlementDisplay', () => {
  it('只回傳金額 > 0 的桶，附 label/tagType/jump', () => {
    const tags = activeSettlementTags(
      settlement({ cash_confirmed: 5000, bank_reconciled: 10800 }),
    )
    expect(tags.map((t) => t.key)).toEqual(['cash_confirmed', 'bank_reconciled'])
    const cash = tags[0]
    expect(cash.label).toBe('現金已簽收')
    expect(cash.amount).toBe(5000)
    expect(cash.jump).toEqual({ ws: 'settlement', view: 'handover' })
    expect(tags[1].jump).toEqual({ ws: 'recon', view: 'collection' })
  })

  it('全 0 或無資料回空陣列；未立據桶不可跳轉', () => {
    expect(activeSettlementTags(settlement())).toEqual([])
    expect(activeSettlementTags(undefined)).toEqual([])
    const [tag] = activeSettlementTags(settlement({ unreceipted: 700 }))
    expect(tag.label).toContain('未立據')
    expect(tag.jump).toBeNull()
  })

  it('sumSettlements 逐桶加總並容忍 null/undefined', () => {
    const total = sumSettlements([
      settlement({ cash_registered: 100, bank_reconciled: 200 }),
      undefined,
      settlement({ cash_registered: 50, unreceipted: 30 }),
    ])
    expect(total).toEqual(
      settlement({ cash_registered: 150, bank_reconciled: 200, unreceipted: 30 }),
    )
  })
})

describe('BillingCodeCell', () => {
  const PopoverStub = {
    template: '<div><slot name="reference" /><slot /></div>',
  }
  const mountCell = (props: Record<string, unknown>) =>
    mount(BillingCodeCell, {
      props,
      global: { stubs: { 'el-popover': PopoverStub } },
    })

  it('無末四碼顯示 —', () => {
    const w = mountCell({ suffix: null, fullNumber: null })
    expect(w.find('[data-test="bcc-empty"]').text()).toBe('—')
    expect(w.find('[data-test="bcc-suffix"]').exists()).toBe(false)
  })

  it('顯示末四碼，展開內容含完整 14 碼與複製鈕', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const w = mountCell({ suffix: '1101', fullNumber: '99817226091101' })
    expect(w.find('[data-test="bcc-suffix"]').text()).toBe('1101')
    expect(w.find('[data-test="bcc-full"]').text()).toBe('99817226091101')

    await w.find('[data-test="bcc-copy"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('99817226091101')
  })

  it('無完整碼（未設專案代號）時顯示說明、不出現複製鈕', () => {
    const w = mountCell({ suffix: '2203', fullNumber: null })
    expect(w.find('[data-test="bcc-no-full"]').text()).toContain('2203')
    expect(w.find('[data-test="bcc-copy"]').exists()).toBe(false)
  })
})

// ─── FeeMonthlyStatement 整合 ───────────────────────────────────────────────

const getFeeMonthlyStatement = vi.fn()
const getPrepayments = vi.fn(() => Promise.resolve({ total: 0, items: [] }))
const getPrepaymentRefunds = vi.fn(() => Promise.resolve({ total: 0, items: [] }))
vi.mock('@/api/fees', () => ({
  getFeeMonthlyStatement: (...args: unknown[]) => getFeeMonthlyStatement(...args),
  getPrepayments: (...args: unknown[]) => getPrepayments(...args),
  getPrepaymentRefunds: (...args: unknown[]) => getPrepaymentRefunds(...args),
}))

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

vi.mock('@/utils/format', () => ({
  todayISO: () => '2026-09-25',
}))

vi.mock('@/components/fees/PrepaymentDrawer.vue', () => ({
  __esModule: true,
  default: { name: 'PrepaymentDrawer', template: '<div />' },
}))
vi.mock('@/components/fees/PrepaymentRefundsDialog.vue', () => ({
  __esModule: true,
  default: { name: 'PrepaymentRefundsDialog', template: '<div />' },
}))
vi.mock('@/components/fees/BatchPayDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'BatchPayDialog',
    props: { modelValue: Boolean, records: { type: Array, default: () => [] } },
    template: '<div />',
  },
}))

import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'

const STATEMENT = {
  month: '2026-09',
  students: [
    {
      student_id: 1,
      student_name: '林同學',
      classroom_name: '向日葵',
      status: 'partial',
      total_due: 10800,
      total_paid: 6200,
      outstanding: 4600,
      billing_code_suffix: '1101',
      full_collection_number: '99817226091101',
      items: [
        {
          id: 11,
          fee_item_name: '月費 (2026-09)',
          fee_type: 'monthly',
          amount_due: 10800,
          amount_paid: 6200,
          status: 'partial',
          payment_date: '2026-09-02',
          payment_method: '現金',
          due_date: '2026-09-15',
          target_month: '2026-09',
          period: '115-1',
          billing_code_suffix: '1101',
          full_collection_number: '99817226091101',
          settlement: settlement({ cash_submitted: 6200 }),
        },
      ],
    },
    {
      student_id: 2,
      student_name: '陳同學',
      classroom_name: '玫瑰',
      status: 'paid',
      total_due: 9500,
      total_paid: 9500,
      outstanding: 0,
      billing_code_suffix: '1202',
      full_collection_number: '99817226091202',
      items: [
        {
          id: 21,
          fee_item_name: '月費 (2026-09)',
          fee_type: 'monthly',
          amount_due: 9500,
          amount_paid: 9500,
          status: 'paid',
          payment_date: '2026-09-03',
          payment_method: '轉帳',
          due_date: '2026-09-15',
          target_month: '2026-09',
          period: '115-1',
          billing_code_suffix: '1202',
          full_collection_number: '99817226091202',
          settlement: settlement({ bank_reconciled: 9500 }),
        },
      ],
    },
  ],
  summary: {
    total_due: 20300,
    total_paid: 15700,
    outstanding: 4600,
    student_count: 2,
    unpaid_count: 0,
    partial_count: 1,
    paid_count: 1,
    settlement: settlement({ cash_submitted: 6200, bank_reconciled: 9500 }),
  },
}

describe('FeeMonthlyStatement 帳單×對帳欄位', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.perms.clear()
    getFeeMonthlyStatement.mockResolvedValue(STATEMENT)
  })

  const mountStatement = () =>
    mount(FeeMonthlyStatement, {
      props: { classrooms: [] },
      global: {
        stubs: {
          'el-popover': { template: '<div><slot name="reference" /><slot /></div>' },
        },
      },
    })

  it('收款確認彙總列顯示 scope 內各桶合計（現金待簽收＋網銀已銷帳）', async () => {
    const w = mountStatement()
    await flushPromises()

    const strip = w.find('[data-test="stmt-settlement"]')
    expect(strip.exists()).toBe(true)
    const tags = strip.findAll('[data-test="stmt-settlement-tag"]')
    expect(tags.map((t) => t.attributes('data-bucket'))).toEqual([
      'cash_submitted',
      'bank_reconciled',
    ])
    expect(tags[0].text()).toContain('現金待簽收')
    expect(tags[0].text()).toContain('6,200')
    expect(tags[1].text()).toContain('網銀已銷帳')
    expect(tags[1].text()).toContain('9,500')
  })

  it('每列顯示銷帳碼末四碼（預設篩掉已繳清，只見部分繳費列）', async () => {
    const w = mountStatement()
    await flushPromises()

    const row = w.find('[data-test="stmt-row"]')
    expect(row.text()).toContain('1101')
  })

  it('展開明細列出逐項收款確認 tag', async () => {
    const w = mountStatement()
    await flushPromises()

    await w.find('[data-test="stmt-expand"]').trigger('click')
    const itemTags = w.findAll('[data-test="stmt-item-settlement-tag"]')
    expect(itemTags.length).toBe(1)
    expect(itemTags[0].text()).toContain('現金待簽收')
  })
})
