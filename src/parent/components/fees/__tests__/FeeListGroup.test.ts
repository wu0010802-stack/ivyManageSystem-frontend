/**
 * FeeListGroup 卡片渲染契約（2026-09-01 UI/UX 打磨）：
 *  - period 內部代碼以 formatSemesterLabel 轉人話
 *  - 已繳清卡不再列「已繳／未繳 $0」噪音，只留應繳金額
 *  - 未結清卡以強調樣式突出「未繳」金額
 *  - 第一張未結清卡帶 data-unpaid-anchor
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeListGroup from '../FeeListGroup.vue'

const LABEL = (s: string) => ({ unpaid: '未繳', partial: '部分繳費', paid: '已繳清' }[s] || s)
const TONE = () => 'neutral' as const

function build(records: Record<string, unknown>[]) {
  return mount(FeeListGroup, {
    props: {
      records: records as never,
      statusLabel: LABEL,
      statusTone: TONE,
    },
    global: { stubs: { StatusPill: true } },
  })
}

const PAID = { id: 1, fee_item_name: '月費 (2026-02)', status: 'paid', amount_due: 11000, amount_paid: 11000, outstanding: 0, due_date: '2026-02-08', period: '114-2' }
const PARTIAL = { id: 2, fee_item_name: '月費 (2026-03)', status: 'partial', amount_due: 11000, amount_paid: 5500, outstanding: 5500, due_date: '2026-03-08', period: '114-2' }
const UNPAID = { id: 3, fee_item_name: '月費 (2026-07)', status: 'unpaid', amount_due: 11000, amount_paid: 0, outstanding: 11000, due_date: '2026-07-08', period: '114-2' }

describe('FeeListGroup 卡片渲染', () => {
  it('period 代碼 114-2 顯示為「114 學年下學期」', () => {
    const w = build([PAID])
    expect(w.text()).toContain('114 學年下學期')
    expect(w.text()).not.toContain('114-2')
  })

  it('已繳清卡只顯示應繳金額，不再列「未繳 $0」噪音', () => {
    const w = build([PAID])
    expect(w.text()).toContain('應繳 $11,000')
    expect(w.text()).not.toContain('未繳 $0')
  })

  it('未結清卡以 .record-outstanding 強調未繳金額，並保留應繳/已繳明細', () => {
    const w = build([PARTIAL])
    const strong = w.find('.record-outstanding')
    expect(strong.exists()).toBe(true)
    expect(strong.text()).toContain('未繳 $5,500')
    expect(w.text()).toContain('應繳 $11,000')
    expect(w.text()).toContain('已繳 $5,500')
  })

  it('第一張未結清卡帶 data-unpaid-anchor（已繳清卡不帶）', () => {
    const w = build([PAID, PARTIAL, UNPAID])
    const anchored = w.findAll('[data-unpaid-anchor]')
    expect(anchored.length).toBe(1)
    expect(anchored[0].text()).toContain('月費 (2026-03)')
  })
})
