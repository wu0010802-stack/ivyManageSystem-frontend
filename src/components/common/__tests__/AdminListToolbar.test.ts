import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AdminListToolbar from '../AdminListToolbar.vue'

const FILTERS = [
  {
    key: 'priority',
    label: '優先級',
    options: [
      { label: '一般', value: 'normal' },
      { label: '重要', value: 'important' },
    ],
  },
]

const mountToolbar = (props: Record<string, unknown> = {}) =>
  mount(AdminListToolbar, { props, global: { plugins: [ElementPlus] } })

describe('AdminListToolbar', () => {
  it('渲染搜尋框，輸入 emit update:search', async () => {
    const wrapper = mountToolbar({ search: '' })
    const input = wrapper.find('[data-test="toolbar-search"] input')
    await input.setValue('王')
    const emitted = wrapper.emitted('update:search')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toBe('王')
  })

  it('searchable=false 時不渲染搜尋框', () => {
    const wrapper = mountToolbar({ searchable: false })
    expect(wrapper.find('[data-test="toolbar-search"]').exists()).toBe(false)
  })

  it('點篩選 chip emit update:filter-values，點「全部」移除該 key', async () => {
    const wrapper = mountToolbar({ filters: FILTERS, filterValues: {} })
    const group = wrapper.find('[data-test="toolbar-filter-priority"]')
    // In JSDOM, el-radio-button listens on the hidden radio input's change event
    const importantInput = group
      .findAll('.el-radio-button__original-radio')
      .find((b) => (b.element as HTMLInputElement).value === 'important')
    await importantInput!.trigger('change')
    let emitted = wrapper.emitted('update:filter-values')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toEqual({ priority: 'important' })

    const wrapper2 = mountToolbar({ filters: FILTERS, filterValues: { priority: 'important' } })
    const g2 = wrapper2.find('[data-test="toolbar-filter-priority"]')
    const allInput = g2
      .findAll('.el-radio-button__original-radio')
      .find((b) => (b.element as HTMLInputElement).value === '__all__')
    await allInput!.trigger('change')
    emitted = wrapper2.emitted('update:filter-values')
    expect(emitted![emitted!.length - 1][0]).toEqual({})
  })

  it('筆數文字：未給 shown → 共 N 筆；shown≠total → 顯示 X / 共 N 筆', () => {
    expect(mountToolbar({ total: 5 }).find('[data-test="toolbar-count"]').text()).toBe('共 5 筆')
    expect(
      mountToolbar({ total: 5, shown: 2 }).find('[data-test="toolbar-count"]').text(),
    ).toBe('顯示 2 / 共 5 筆')
  })

  it('exportable 渲染匯出鈕並 emit export；預設不渲染', async () => {
    expect(mountToolbar({}).find('[data-test="toolbar-export"]').exists()).toBe(false)
    const wrapper = mountToolbar({ exportable: true })
    await wrapper.find('[data-test="toolbar-export"]').trigger('click')
    expect(wrapper.emitted('export')).toBeTruthy()
  })
})
