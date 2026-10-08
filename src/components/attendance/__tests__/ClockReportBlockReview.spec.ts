import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClockReportBlockReview from '../ClockReportBlockReview.vue'

const blocks = [
  {
    block_id: '901:21', source_employee_number: '901', source_name: '測試甲', department: '教師',
    first_day: 21, layout: 'grid' as const,
    date_line: '21 一        22 二     23 三',
    raw_lines: ['                                15:52-17:1315:52-17:13'],
    proposals: [
      { date: '2026-09-23', punch_in: '15:52', punch_out: '17:13' },
      { date: '2026-09-24', punch_in: null, punch_out: '17:13' },
    ],
  },
  {
    block_id: '902:1', source_employee_number: '902', source_name: '測試乙', department: '教師',
    first_day: 1, layout: 'interleaved' as const, date_line: '01 二', raw_lines: ['-  08:38-11:35'],
    proposals: [{ date: '2026-09-01', punch_in: '08:38', punch_out: '11:35' }],
  },
]

const ElButton = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

function mountReview(props: Partial<InstanceType<typeof ClockReportBlockReview>['$props']> = {}) {
  return mount(ClockReportBlockReview, {
    props: { blocks, confirmed: new Set<string>(), ...props },
    global: { stubs: { 'el-button': ElButton } },
  })
}

describe('打卡鐘推估區塊確認', () => {
  it('並排顯示報表原文與推估日期，缺卡的一側標明缺卡', () => {
    const wrapper = mountReview()
    const first = wrapper.find('[data-block-id="901:21"]')
    expect(first.text()).toContain('測試甲')
    expect(first.text()).toContain('卡號 901')
    expect(first.find('pre').text()).toBe('21 一        22 二     23 三\n                                15:52-17:1315:52-17:13')
    expect(first.findAll('tbody tr').map(tr => tr.findAll('td').map(td => td.text()))).toEqual([
      ['2026-09-23', '15:52', '17:13'],
      ['2026-09-24', '缺卡', '17:13'],
    ])
  })

  it('勾選時送出區塊代號，並顯示尚未確認的區塊數', async () => {
    const wrapper = mountReview({ confirmed: new Set(['902:1']) })
    expect(wrapper.text()).toContain('尚有 1 個區塊未確認')
    await wrapper.find('[data-block-id="901:21"] input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('toggle')).toEqual([['901:21', true]])
  })

  it('全部確認後不再提示，且需先有變更才能重新預覽', async () => {
    const clean = mountReview({ confirmed: new Set(['901:21', '902:1']), dirty: false })
    expect(clean.text()).toContain('所有區塊皆已確認')
    expect(clean.find('[data-reapply]').attributes('disabled')).toBeDefined()
    const dirty = mountReview({ confirmed: new Set(['901:21', '902:1']), dirty: true })
    expect(dirty.text()).toContain('請重新預覽後再匯入')
    await dirty.find('[data-reapply]').trigger('click')
    expect(dirty.emitted('reapply')).toHaveLength(1)
  })

  it('停用時所有勾選與重新預覽都不可操作', () => {
    const wrapper = mountReview({ disabled: true, dirty: true })
    expect(wrapper.findAll('input[type="checkbox"]').every(input => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('[data-reapply]').attributes('disabled')).toBeDefined()
  })
})
