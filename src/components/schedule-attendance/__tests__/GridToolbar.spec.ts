import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import GridToolbar from '../GridToolbar.vue'
import { W1 } from './gridFixtures'

const COUNTS = { all: 35, issues: 14, patterns: 6, leftover: 4 }
const buttonTexts = (wrapper: ReturnType<typeof mountToolbar>) => wrapper.findAllComponents({ name: 'ElRadioButton' }).map((b) => b.text())

function mountToolbar(props: Partial<InstanceType<typeof GridToolbar>['$props']> = {}) {
  return mount(GridToolbar, {
    props: { mode: 'reconcile', weekStart: W1, filter: 'all', keyword: '', canEditPlan: true, pendingCount: 0, ...props },
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

  it('篩選切換送出 update:filter', () => {
    const wrapper = mountToolbar({ filterCounts: COUNTS, sealState: 'partial' })
    const group = wrapper.findComponent({ name: 'ElRadioGroup' })
    for (const value of ['issues', 'patterns', 'leftover', 'all']) group.vm.$emit('update:modelValue', value)
    expect(wrapper.emitted('update:filter')).toEqual([['issues'], ['patterns'], ['leftover'], ['all']])
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

  it('排班頁籤：儲存鈕只在有變更時出現並顯示變更數；沒有排班權限或手機就不顯示排班工具', async () => {
    // 停用的「儲存排班（0 處變更）」是整排最搶眼卻不能按的元素：沒有變更就不畫
    const none = mountToolbar({ mode: 'plan' })
    expect(none.find('[data-test="toolbar-save"]').exists()).toBe(false)
    expect(none.find('[data-test="toolbar-schedule"]').exists()).toBe(true)
    expect(mountToolbar({ mode: 'plan', compact: true }).find('[data-test="toolbar-schedule"]').exists()).toBe(false)
    // 手機列上仍能改本週班別：有變更時儲存鈕要在（審查 F2）
    expect(mountToolbar({ mode: 'plan', compact: true, pendingCount: 1 }).find('[data-test="toolbar-save"]').exists()).toBe(true)
    const some = mountToolbar({ mode: 'plan', pendingCount: 2 })
    const save = some.find('[data-test="toolbar-save"]')
    expect(save.text()).toBe('儲存排班（2 處變更）')
    await save.trigger('click')
    expect(some.emitted('save')).toHaveLength(1)
    expect(mountToolbar({ mode: 'plan', canEditPlan: false }).find('[data-test="toolbar-save"]').exists()).toBe(false)
  })

  it('排班工具收成一個選單：複製上週送 copy-prev-week，其他指令原樣轉出', () => {
    const wrapper = mountToolbar({ mode: 'plan' })
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
    const dirty = mountToolbar({ mode: 'plan', pendingCount: 2 })
    expect(dirty.find('[data-test="toolbar-save"]').classes()).toContain('el-button--primary')
  })

  it('桌機捲動時工具列（含儲存排班）固定在頂端', () => {
    const css = readFileSync(resolve(__dirname, '../GridToolbar.vue'), 'utf8')
    expect(css).toMatch(/@media \(--bp-sm\)[^@]*\.grid-toolbar[^{]*\{[^}]*position: sticky[^}]*top: 0/)
  })
})

describe('GridToolbar 篩選人數的範圍字（R50）', () => {
  const scope = (wrapper: ReturnType<typeof mountToolbar>) => wrapper.find('[data-test="toolbar-filter-scope"]')

  it('桌機核對：篩選群組前寫範圍字，週檢視是「本週」、月檢視是「本月」', () => {
    expect(scope(mountToolbar({ filterCounts: COUNTS })).text()).toBe('本週')
    expect(scope(mountToolbar({ filterCounts: COUNTS, view: 'week' })).text()).toBe('本週')
    expect(scope(mountToolbar({ filterCounts: COUNTS, view: 'month', date: '2026-09-16' })).text()).toBe('本月')
  })

  it('排班不加範圍字（只有全部與只看未來可排，沒有人數）', () => {
    const wrapper = mountToolbar({ mode: 'plan', filterCounts: COUNTS })
    expect(scope(wrapper).exists()).toBe(false)
    expect(buttonTexts(wrapper)).toEqual(['全部', '只看未來可排'])
    const mobile = mountToolbar({ mode: 'plan', compact: true })
    expect(mobile.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'))).toEqual(['全部', '只看未來可排'])
  })

  it('手機核對：下拉每個選項前加同樣的範圍字；桌機不另外把範圍字塞進按鈕文字', () => {
    const month = mountToolbar({ compact: true, view: 'month', date: '2026-09-16', filterCounts: COUNTS, sealState: 'partial' })
    expect(month.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'))).toEqual([
      '本月・全部（35 人）',
      '本月・有待辦（14 人）',
      '本月・設定問題（6 人）',
      '本月・封存時未處理（4 人）',
    ])
    expect(scope(month).exists()).toBe(false) // 手機的範圍字在選項文字裡，不另外畫
    expect(buttonTexts(mountToolbar({ filterCounts: COUNTS }))).toEqual(['全部（35 人）', '有待辦（14 人）', '設定問題（6 人）'])
  })
})

describe('GridToolbar 核對／排班兩種模式', () => {
  it('兩種模式都沒有週／月切換（核對的檢視切換在頁面，排班只有週）', () => {
    expect(mountToolbar({ mode: 'reconcile' }).find('[data-test="toolbar-view"]').exists()).toBe(false)
    expect(mountToolbar({ mode: 'plan' }).find('[data-test="toolbar-view"]').exists()).toBe(false)
  })

  it('核對（未封存）：全部、有待辦、設定問題，後面接人數（以人為單位）；有排班權限、有變更也不放排班工具與儲存排班', () => {
    const wrapper = mountToolbar({ mode: 'reconcile', canEditPlan: true, pendingCount: 2, filterCounts: COUNTS, sealState: 'open' })
    expect(buttonTexts(wrapper)).toEqual(['全部（35 人）', '有待辦（14 人）', '設定問題（6 人）'])
    expect(wrapper.text()).not.toContain('只看待處理')
    expect(wrapper.find('[data-test="toolbar-schedule"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-save"]').exists()).toBe(false)
  })

  it('核對（部分員工已封存）：多一個封存時未處理；其餘照舊', () => {
    expect(buttonTexts(mountToolbar({ filterCounts: COUNTS, sealState: 'partial' }))).toEqual([
      '全部（35 人）',
      '有待辦（14 人）',
      '設定問題（6 人）',
      '封存時未處理（4 人）',
    ])
  })

  it('核對（整月已封存）：沒有待辦可做，只剩全部與封存時未處理', () => {
    const wrapper = mountToolbar({ filterCounts: { ...COUNTS, issues: 0, patterns: 0, leftover: 14 }, sealState: 'sealed' })
    expect(buttonTexts(wrapper)).toEqual(['全部（35 人）', '封存時未處理（14 人）'])
    expect(wrapper.text()).not.toContain('有待辦')
    expect(wrapper.text()).not.toContain('設定問題')
  })

  it('封存狀態還沒載到當作未封存；人數還沒算出來就不寫人數（不寫成 0 人）', () => {
    expect(buttonTexts(mountToolbar({ filterCounts: COUNTS }))).toEqual(['全部（35 人）', '有待辦（14 人）', '設定問題（6 人）'])
    expect(buttonTexts(mountToolbar({ sealState: 'open' }))).toEqual(['全部', '有待辦', '設定問題'])
    // 網址指定了封存時未處理、月摘要還沒到：先留著這個選項，才有東西可選回去
    expect(buttonTexts(mountToolbar({ filter: 'leftover', filterCounts: COUNTS }))).toEqual([
      '全部（35 人）',
      '有待辦（14 人）',
      '設定問題（6 人）',
      '封存時未處理（4 人）',
    ])
  })

  it('排班：篩選只有全部與只看未來可排（沒有待辦、沒有人數）；有排班工具', () => {
    const wrapper = mountToolbar({ mode: 'plan', filterCounts: COUNTS, sealState: 'sealed' })
    expect(buttonTexts(wrapper)).toEqual(['全部', '只看未來可排'])
    expect(wrapper.text()).not.toContain('有待辦')
    expect(wrapper.find('[data-test="toolbar-schedule"]').exists()).toBe(true)
  })

  it('手機（compact）：篩選收成單一下拉，選項是桌機的選項前接範圍字；選了送出 update:filter，沒有按鈕群組', () => {
    const wrapper = mountToolbar({ compact: true, filterCounts: COUNTS, sealState: 'partial', filter: 'issues' })
    expect(wrapper.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(false)
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.attributes('data-test')).toBe('toolbar-filter')
    expect(select.props('ariaLabel')).toBe('篩選人員')
    // 選項文字前接範圍字（週檢視＝本週）：人數是這個範圍的人數
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'))).toEqual([
      '本週・全部（35 人）',
      '本週・有待辦（14 人）',
      '本週・設定問題（6 人）',
      '本週・封存時未處理（4 人）',
    ])
    expect(select.props('modelValue')).toBe('issues')
    select.vm.$emit('update:modelValue', 'leftover')
    expect(wrapper.emitted('update:filter')).toEqual([['leftover']])
  })

  it('手機的排班工具列也是單一下拉（全部／只看未來可排）', () => {
    const wrapper = mountToolbar({ mode: 'plan', compact: true })
    expect(wrapper.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'))).toEqual(['全部', '只看未來可排'])
  })

  it('核對的月模式：寫年月；上／下個月與月份選擇送出月初；沒有週導覽與排班工具', async () => {
    const wrapper = mountToolbar({ view: 'month', date: '2026-01-16', pendingCount: 2 })
    expect(wrapper.text()).toContain('2026 年 1 月')
    await wrapper.find('[data-test="toolbar-prev-month"]').trigger('click')
    await wrapper.find('[data-test="toolbar-next-month"]').trigger('click')
    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-05')
    expect(wrapper.emitted('update:date')).toEqual([['2025-12-01'], ['2026-02-01'], ['2026-05-01']])
    expect(wrapper.find('[data-test="toolbar-save"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-copy"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-prev"]').exists()).toBe(false)
  })

  it('頁首已有年月切換時，月模式不再放第二組月份導覽', () => {
    const wrapper = mountToolbar({ view: 'month', date: '2026-01-16', hideMonthNav: true })
    expect(wrapper.find('[data-test="toolbar-prev-month"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-month"]').exists()).toBe(false)
    // 也不能退回顯示週導覽（月模式沒有「上週／下週」）
    expect(wrapper.find('[data-test="toolbar-prev"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-date"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-filter"]').exists()).toBe(true)
  })
})
