import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import GridToolbar from '../GridToolbar.vue'
import { W1 } from './gridFixtures'

function mountToolbar(props: Partial<InstanceType<typeof GridToolbar>['$props']> = {}) {
  return mount(GridToolbar, {
    props: { weekStart: W1, filter: 'all', canEditPlan: true, pendingCount: 0, ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('GridToolbar', () => {
  it('上下週與日期選擇一律對齊週一', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.text()).toContain('9/14～9/20')
    await wrapper.find('[data-test="toolbar-prev"]').trigger('click')
    await wrapper.find('[data-test="toolbar-next"]').trigger('click')
    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-10-01')
    expect(wrapper.emitted('update:weekStart')).toEqual([['2026-09-07'], ['2026-09-21'], ['2026-09-28']])
  })

  it('篩選切換與問題數', () => {
    const wrapper = mountToolbar({ issueCount: 3 })
    expect(wrapper.text()).toContain('只看有問題（3）')
    wrapper.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'issues')
    expect(wrapper.emitted('update:filter')).toEqual([['issues']])
  })

  it('儲存鈕顯示變更數、沒有變更時停用；沒有排班權限就不顯示排班工具', async () => {
    const none = mountToolbar()
    expect(none.find('[data-test="toolbar-save"]').attributes('disabled')).toBeDefined()
    const some = mountToolbar({ pendingCount: 2 })
    const save = some.find('[data-test="toolbar-save"]')
    expect(save.text()).toBe('儲存排班（2 處變更）')
    await save.trigger('click')
    expect(some.emitted('save')).toHaveLength(1)
    expect(mountToolbar({ canEditPlan: false }).find('[data-test="toolbar-save"]').exists()).toBe(false)
  })

  it('下拉選單指令原樣轉出', () => {
    const wrapper = mountToolbar()
    const dropdowns = wrapper.findAllComponents({ name: 'ElDropdown' })
    dropdowns[0].vm.$emit('click')
    dropdowns[0].vm.$emit('command', 'copy-prev-month')
    dropdowns[1].vm.$emit('command', 'export')
    expect(wrapper.emitted('copy-prev-week')).toHaveLength(1)
    expect(wrapper.emitted('command')).toEqual([['copy-prev-month'], ['export']])
  })
})
