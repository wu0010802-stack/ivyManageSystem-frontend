import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

/**
 * 稽核 P3-09（2026-08-14）：「依日期」月曆的日期格原本是純 `div` + `@click`，
 * 沒有 tabindex / role / 鍵盤事件——鍵盤與讀屏使用者完全選不到日期，等於整個
 * 依日期收款流程對他們是死路。
 *
 * 這組測試釘住月曆的鍵盤與語意可及性：grid 語意、可聚焦、Enter/Space 可選日期、
 * 方向鍵可在日期間移動。
 */

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function mountCalendar(props: Record<string, unknown> = {}) {
  return mount(POSSearchPanel, {
    props: {
      mode: 'by-date',
      searchQuery: '',
      registrations: [],
      ...props,
    },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-card': slotStub(),
        'el-scrollbar': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-select': slotStub(),
        'el-input': true,
        'el-option': true,
        'el-switch': true,
        'el-alert': true,
        'el-checkbox': true,
        'el-button': true,
      },
    },
  })
}

describe('POSSearchPanel 依日期月曆鍵盤可及性', () => {
  it('月曆有 grid 語意，日期格是 gridcell', () => {
    const wrapper = mountCalendar()

    expect(wrapper.get('.pos-cal__grid').attributes('role')).toBe('grid')

    const cells = wrapper.findAll('.pos-cal__cell')
    expect(cells.length).toBeGreaterThan(0)
    expect(cells[0].attributes('role')).toBe('gridcell')

    // gridcell 必須包在 row 裡，否則 grid 語意對讀屏是壞的
    expect(wrapper.findAll('[role="row"]').length).toBeGreaterThan(0)
    expect(wrapper.get('.pos-cal__weekdays').attributes('role')).toBe('row')
  })

  it('日期格可被鍵盤聚焦（有 tabindex）', () => {
    const cells = mountCalendar().findAll('.pos-cal__cell')

    expect(cells[0].attributes('tabindex')).toBeDefined()
    // roving tabindex：至少要有一格是 0，否則整個月曆進不去
    expect(cells.some((c) => c.attributes('tabindex') === '0')).toBe(true)
  })

  it('日期格有可朗讀的 aria-label（含日期）', () => {
    const cells = mountCalendar().findAll('.pos-cal__cell')
    const label = cells[10].attributes('aria-label') || ''

    expect(label).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('Enter 可選取日期（等同滑鼠點擊）', async () => {
    const wrapper = mountCalendar()
    const cell = wrapper.findAll('.pos-cal__cell')[10]

    expect(cell.attributes('aria-selected')).toBe('false')

    await cell.trigger('keydown.enter')

    expect(wrapper.findAll('.pos-cal__cell')[10].attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.pos-cal__cell')[10].classes()).toContain('pos-cal__cell--active')
  })

  it('Space 可選取日期', async () => {
    const wrapper = mountCalendar()
    const cell = wrapper.findAll('.pos-cal__cell')[12]

    await cell.trigger('keydown.space')

    expect(wrapper.findAll('.pos-cal__cell')[12].attributes('aria-selected')).toBe('true')
  })

  it('方向鍵可在日期格之間移動焦點', async () => {
    const wrapper = mountCalendar()
    const cells = wrapper.findAll('.pos-cal__cell')

    await cells[10].trigger('keydown.right')

    // 焦點格改為第 11 格（roving tabindex：只有它是 0）
    const after = wrapper.findAll('.pos-cal__cell')
    expect(after[11].attributes('tabindex')).toBe('0')
    expect(after[10].attributes('tabindex')).toBe('-1')
  })
})
