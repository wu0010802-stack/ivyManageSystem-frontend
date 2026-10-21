import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import GridToolbar from '../GridToolbar.vue'
import { W1 } from './gridFixtures'

function mountToolbar(props: Partial<InstanceType<typeof GridToolbar>['$props']> = {}) {
  return mount(GridToolbar, {
    props: { weekStart: W1, filter: 'all', keyword: '', canEditPlan: true, pendingCount: 0, ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('GridToolbar', () => {
  it('上下週對齊週一；日期選擇器保留使用者選的那天（QA P3：寫成週一會讓跨月週跳到上個月）', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.text()).toContain('9/14～9/20')
    await wrapper.find('[data-test="toolbar-prev"]').trigger('click')
    await wrapper.find('[data-test="toolbar-next"]').trigger('click')
    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-10-01')
    expect(wrapper.emitted('update:weekStart')).toEqual([['2026-09-07'], ['2026-09-21'], ['2026-10-01']])
  })

  it('上下週跨月：該週有落在原月的日子就用原月的第一天（比照 openWeek），整週離開原月才用週一', async () => {
    // 10 月：從 10/5 週往前到 9/28 週（9/28–10/4）仍含 10 月 → 10/1，不跳到 9 月
    const oct = mountToolbar({ weekStart: '2026-10-05', date: '2026-10-07' })
    await oct.find('[data-test="toolbar-prev"]').trigger('click')
    // 10 月：從 9/28 週（錨點 10/1）再往前到 9/21 週：整週在 9 月 → 週一
    const oct2 = mountToolbar({ weekStart: '2026-09-28', date: '2026-10-01' })
    await oct2.find('[data-test="toolbar-prev"]').trigger('click')
    // 9 月往後到 9/28 週：週一在 9 月 → 9/28
    const sep = mountToolbar({ weekStart: '2026-09-21', date: '2026-09-21' })
    await sep.find('[data-test="toolbar-next"]').trigger('click')
    expect(oct.emitted('update:weekStart')).toEqual([['2026-10-01']])
    expect(oct2.emitted('update:weekStart')).toEqual([['2026-09-21']])
    expect(sep.emitted('update:weekStart')).toEqual([['2026-09-28']])
  })

  it('篩選切換與問題數', () => {
    const wrapper = mountToolbar({ issueCount: 3 })
    // 數字寫出範圍：週檢視是本週，與本月進度的「本月 N 格」分得開
    expect(wrapper.text()).toContain('只看待處理（本週 3）')
    expect(mountToolbar({ issueCount: 7, view: 'month', canMonth: true }).text()).toContain('只看待處理（本月 7）')
    // 待修設定（整月同型態）和逐日待處理分開寫
    expect(mountToolbar({ issueCount: 109, patternIssueCount: 60 }).text()).toContain('只看待處理（本週 49＋待修設定 60）')
    wrapper.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'issues')
    expect(wrapper.emitted('update:filter')).toEqual([['issues']])
  })

  it('人員搜尋框（姓名或工號）：輸入與清除都送出 update:keyword', async () => {
    const wrapper = mountToolbar()
    const input = wrapper.find('[data-test="toolbar-keyword"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('搜尋姓名或工號')
    expect(input.attributes('aria-label')).toBe('搜尋人員')
    await input.setValue('E003')
    // 日期選擇器內部也有 ElInput：以 placeholder 找出搜尋框那個（模擬 clearable 的清除）
    wrapper.findAllComponents({ name: 'ElInput' }).find((c) => c.props('placeholder') === '搜尋姓名或工號')!.vm.$emit('update:modelValue', '')
    expect(wrapper.emitted('update:keyword')).toEqual([['E003'], ['']])
  })

  it('人員搜尋框顯示傳入的關鍵字，沒有排班權限的人也看得到', () => {
    const wrapper = mountToolbar({ keyword: '王副', canEditPlan: false })
    expect((wrapper.find('[data-test="toolbar-keyword"]').element as HTMLInputElement).value).toBe('王副')
  })

  it('儲存鈕只在有變更時出現並顯示變更數；沒有排班權限或手機就不顯示排班工具', async () => {
    // 停用的「儲存排班（0 處變更）」是整排最搶眼卻不能按的元素：沒有變更就不畫
    const none = mountToolbar()
    expect(none.find('[data-test="toolbar-save"]').exists()).toBe(false)
    expect(none.find('[data-test="toolbar-schedule"]').exists()).toBe(true)
    expect(mountToolbar({ compact: true }).find('[data-test="toolbar-schedule"]').exists()).toBe(false)
    const some = mountToolbar({ pendingCount: 2 })
    const save = some.find('[data-test="toolbar-save"]')
    expect(save.text()).toBe('儲存排班（2 處變更）')
    await save.trigger('click')
    expect(some.emitted('save')).toHaveLength(1)
    expect(mountToolbar({ canEditPlan: false }).find('[data-test="toolbar-save"]').exists()).toBe(false)
  })

  it('排班工具收成一個選單：複製上週送 copy-prev-week，其他指令原樣轉出', () => {
    const wrapper = mountToolbar()
    const dropdowns = wrapper.findAllComponents({ name: 'ElDropdown' })
    expect(dropdowns).toHaveLength(1)
    dropdowns[0].vm.$emit('command', 'copy-prev-week')
    dropdowns[0].vm.$emit('command', 'copy-prev-month')
    dropdowns[0].vm.$emit('command', 'export')
    expect(wrapper.emitted('copy-prev-week')).toHaveLength(1)
    expect(wrapper.emitted('command')).toEqual([['copy-prev-month'], ['export']])
  })

  it('儲存中不能換週（上週、日期、下週三者皆停用）', () => {
    const saving = mountToolbar({ pendingCount: 2, saving: true })
    expect(saving.find('[data-test="toolbar-prev"]').attributes('disabled')).toBeDefined()
    expect(saving.find('[data-test="toolbar-next"]').attributes('disabled')).toBeDefined()
    expect(saving.findComponent({ name: 'ElDatePicker' }).props('disabled')).toBe(true)
    const idle = mountToolbar({ pendingCount: 2, saving: false })
    expect(idle.find('[data-test="toolbar-prev"]').attributes('disabled')).toBeUndefined()
    expect(idle.findComponent({ name: 'ElDatePicker' }).props('disabled')).toBe(false)
  })

  it('儲存排班出現時是主要按鈕（沒有變更時不出現，見上）', () => {
    const dirty = mountToolbar({ pendingCount: 2 })
    expect(dirty.find('[data-test="toolbar-save"]').classes()).toContain('el-button--primary')
  })

  it('桌機捲動時工具列（含儲存排班）固定在頂端', () => {
    const css = readFileSync(resolve(__dirname, '../GridToolbar.vue'), 'utf8')
    expect(css).toMatch(/@media \(--bp-sm\)[^@]*\.grid-toolbar[^{]*\{[^}]*position: sticky[^}]*top: 0/)
  })
})

describe('GridToolbar 週／月（SPEC-027 C 期）', () => {
  it('桌機才有週／月切換；切換送出 update:view', () => {
    expect(mountToolbar().find('[data-test="toolbar-view"]').exists()).toBe(false)
    const wrapper = mountToolbar({ canMonth: true })
    // 週／月與篩選都是 ElRadioGroup：以 data-test 取週／月那一組，不依賴 DOM 順序
    wrapper.find('[data-test="toolbar-view"]').findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'month')
    expect(wrapper.emitted('update:view')).toEqual([['month']])
  })

  it('月模式：寫年月；上／下個月與月份選擇送出月初；排班工具收起、未儲存週排班有提示', async () => {
    const wrapper = mountToolbar({ canMonth: true, view: 'month', date: '2026-01-16', pendingCount: 2 })
    expect(wrapper.text()).toContain('2026 年 1 月')
    await wrapper.find('[data-test="toolbar-prev-month"]').trigger('click')
    await wrapper.find('[data-test="toolbar-next-month"]').trigger('click')
    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-05')
    expect(wrapper.emitted('update:date')).toEqual([['2025-12-01'], ['2026-02-01'], ['2026-05-01']])
    expect(wrapper.find('[data-test="toolbar-save"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-copy"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-prev"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-month-pending"]').text()).toContain('2 處')
  })

  it('頁首已有年月切換時，月模式不再放第二組月份導覽', () => {
    const wrapper = mountToolbar({ canMonth: true, view: 'month', date: '2026-01-16', hideMonthNav: true })
    expect(wrapper.find('[data-test="toolbar-prev-month"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-month"]').exists()).toBe(false)
    // 也不能退回顯示週導覽（月模式沒有「上週／下週」）
    expect(wrapper.find('[data-test="toolbar-prev"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-date"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-filter"]').exists()).toBe(true)
  })
})
