import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(true)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

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
  {
    key: 'status',
    label: '狀態',
    options: [
      { label: '待處理', value: 'pending' },
      { label: '已結案', value: 'done' },
    ],
  },
]

const mountToolbar = (props: Record<string, unknown> = {}) =>
  mount(AdminListToolbar, { props, global: { plugins: [ElementPlus] } })

describe('AdminListToolbar 手機篩選 sheet', () => {
  it('手機：篩選改由「篩選」按鈕開啟，不再常駐佔版面', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({ filters: FILTERS, filterValues: {} })
    await nextTick()

    expect(wrapper.find('[data-test="toolbar-filter-trigger"]').exists()).toBe(true)
    // 常駐的段落鈕在手機不渲染（改進 sheet）
    expect(wrapper.find('[data-test="toolbar-filter-priority"]').exists()).toBe(false)
  })

  it('桌機：維持原本常駐段落鈕，且沒有篩選鈕（零回歸）', async () => {
    mockIsMobile.value = false
    const wrapper = mountToolbar({ filters: FILTERS, filterValues: {} })
    await nextTick()

    expect(wrapper.find('[data-test="toolbar-filter-trigger"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-filter-priority"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="toolbar-filter-status"]').exists()).toBe(true)
  })

  it('手機：沒有任何 filter group 時不出現篩選鈕', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({ filters: [], filterValues: {} })
    await nextTick()

    expect(wrapper.find('[data-test="toolbar-filter-trigger"]').exists()).toBe(false)
  })

  it('手機：篩選鈕標示已選條件數量', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({
      filters: FILTERS,
      filterValues: { priority: 'important', status: 'pending' },
    })
    await nextTick()

    expect(wrapper.get('[data-test="toolbar-filter-trigger"]').text()).toContain('2')
  })

  it('手機：已選條件顯示為可移除 chip，移除後 emit 不含該 key 的新值', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({
      filters: FILTERS,
      filterValues: { priority: 'important', status: 'pending' },
    })
    await nextTick()

    const chip = wrapper.get('[data-test="toolbar-chip-priority"]')
    expect(chip.text()).toContain('優先級')
    expect(chip.text()).toContain('重要')

    await chip.get('.el-tag__close').trigger('click')
    const emitted = wrapper.emitted('update:filter-values')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toEqual({ status: 'pending' })
  })

  it('手機：整顆 chip 都是移除目標（EP 關閉圖示僅 20px，不足 44px 觸控下限）', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({
      filters: FILTERS,
      filterValues: { priority: 'important', status: 'pending' },
    })
    await nextTick()

    const chip = wrapper.get('[data-test="toolbar-chip-status"]')
    expect(chip.attributes('role')).toBe('button')
    expect(chip.attributes('aria-label')).toContain('移除篩選條件')

    await chip.trigger('click')
    const emitted = wrapper.emitted('update:filter-values')
    expect(emitted![emitted!.length - 1][0]).toEqual({ priority: 'important' })
  })

  it('手機：清除全部會 emit 空的 filterValues', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({
      filters: FILTERS,
      filterValues: { priority: 'important', status: 'pending' },
    })
    await nextTick()

    await wrapper.get('[data-test="toolbar-filter-trigger"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-test="toolbar-filter-clear"]').trigger('click')

    const emitted = wrapper.emitted('update:filter-values')
    expect(emitted![emitted!.length - 1][0]).toEqual({})
  })

  it('手機：sheet 內選取選項仍走同一條 update:filter-values 契約', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({ filters: FILTERS, filterValues: {} })
    await nextTick()

    await wrapper.get('[data-test="toolbar-filter-trigger"]').trigger('click')
    await nextTick()

    const group = wrapper.get('[data-test="toolbar-sheet-filter-priority"]')
    const input = group
      .findAll('.el-radio-button__original-radio')
      .find((b) => (b.element as HTMLInputElement).value === 'important')
    await input!.trigger('change')

    const emitted = wrapper.emitted('update:filter-values')
    expect(emitted![emitted!.length - 1][0]).toEqual({ priority: 'important' })
  })

  it('手機：搜尋契約不變', async () => {
    mockIsMobile.value = true
    const wrapper = mountToolbar({ search: '', filters: FILTERS })
    await nextTick()

    await wrapper.find('[data-test="toolbar-search"] input').setValue('王')
    const emitted = wrapper.emitted('update:search')
    expect(emitted![emitted!.length - 1][0]).toBe('王')
  })
})
