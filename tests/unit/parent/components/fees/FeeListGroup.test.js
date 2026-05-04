import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeListGroup from '@/parent/components/fees/FeeListGroup.vue'

const records = [
  {
    id: 1,
    fee_item_name: '5 月學費',
    status: 'paid',
    amount_due: 8000,
    amount_paid: 8000,
    outstanding: 0,
    due_date: '2026-05-05',
    period: '2026-05',
  },
  {
    id: 2,
    fee_item_name: '5 月才藝費',
    status: 'unpaid',
    amount_due: 1500,
    amount_paid: 0,
    outstanding: 1500,
    due_date: '2026-05-10',
    period: '2026-05',
  },
  {
    id: 3,
    fee_item_name: '5 月午餐費',
    status: 'partial',
    amount_due: 600,
    amount_paid: 200,
    outstanding: 400,
    due_date: '2026-05-15',
    period: '2026-05',
  },
]

const statusLabel = (s) => ({ paid: '已繳清', unpaid: '未繳', partial: '部分繳費' }[s] || s)
const statusColor = (s) =>
  s === 'unpaid' ? { bg: '#fee', color: '#900' } : null

describe('FeeListGroup', () => {
  it('渲染所有紀錄並標記第一筆未繳為 anchor', () => {
    const wrapper = mount(FeeListGroup, {
      props: { records, statusLabel, statusColor },
    })
    expect(wrapper.findAll('.record-card')).toHaveLength(3)
    const anchors = wrapper.findAll('[data-unpaid-anchor]')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].text()).toContain('5 月才藝費')
  })

  it('statusColor 預設 () => null 不會丟錯', () => {
    const wrapper = mount(FeeListGroup, {
      props: {
        records: [records[0]],
        statusLabel,
      },
    })
    expect(wrapper.find('.record-status').exists()).toBe(true)
    expect(wrapper.text()).toContain('已繳清')
  })

  it('卡片點擊 emit record-click 並帶 record', async () => {
    const wrapper = mount(FeeListGroup, {
      props: { records, statusLabel, statusColor },
    })
    await wrapper.findAll('.record-card')[1].trigger('click')
    expect(wrapper.emitted('record-click')).toBeTruthy()
    expect(wrapper.emitted('record-click')[0][0]).toEqual(records[1])
  })
})
