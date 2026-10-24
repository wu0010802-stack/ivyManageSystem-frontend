import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import MonthGrid from '../MonthGrid.vue'
import { cell, day, employee, grid } from './gridFixtures'
import { indexCells, type GridCell } from '@/utils/scheduleAttendanceGrid'

// 10 月：10/1 是週四 → 第一週欄頭要切到 9/28（Review Focus #1）
const DAYS = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].map((d) => day(d))
const LEAVE = { leave_id: 1, leave_type_label: '事假', is_full_day: true, status: 'approved' as const, start_time: null, end_time: null }

function mountMonth(cells: GridCell[], props: Record<string, unknown> = {}) {
  const g = grid({ days: DAYS, cells, today: '2026-10-05', employees: [employee(1, '林班導'), employee(2, '王副導', { employee_number: 'E002' })] })
  return mount(MonthGrid, {
    props: { groups: g.groups, employees: g.employees, days: g.days, cells: indexCells(g.cells), today: g.today, filter: 'all', ...props },
  })
}

const ALL = [
  cell(1, '2026-10-01', { actual: { status: 'anomaly' } }),
  cell(1, '2026-10-02', { actual: { status: 'possible_shift_change' } }),
  cell(1, '2026-10-05', { actual: {}, leaves: [LEAVE] }),
  cell(1, '2026-10-06', { plan: { name: '晚車' } }),
  cell(2, '2026-10-01', { actual: {} }),
  cell(2, '2026-10-02', { actual: {} }),
  cell(2, '2026-10-05', { actual: {} }),
  cell(2, '2026-10-06', { employed: false }),
]

describe('MonthGrid 人員註記（本月型態）', () => {
  it('人員欄寫出註記與整句說明', () => {
    const wrapper = mountMonth(ALL, { personNotes: { 1: { tag: '時段可能設錯', detail: '上下班都有打卡的 20 天中，20 天遲到（多為 55 分）' } } })
    const note = wrapper.get('[data-test="mperson-note-1"]')
    expect(note.text()).toBe('時段可能設錯')
    expect(note.attributes('title')).toContain('20 天遲到')
    expect(wrapper.find('[data-test="mperson-note-2"]').exists()).toBe(false)
  })
})

describe('MonthGrid（SPEC-027 C 期，唯讀）', () => {
  it('週次欄頭依週一分組；點欄頭送出該週週一（跨月週是 9/28）', async () => {
    const wrapper = mountMonth(ALL)
    expect(wrapper.find('[data-test="month-week-2026-09-28"]').text()).toBe('10/1–10/2')
    await wrapper.find('[data-test="month-week-2026-09-28"]').trigger('click')
    await wrapper.find('[data-test="month-week-2026-10-05"]').trigger('click')
    expect(wrapper.emitted('open-week')).toEqual([['2026-09-28'], ['2026-10-05']])
  })

  it('每格只放班別縮寫＋狀態點：紅／橘／藍；全天假寫「假」；未來日淡色', () => {
    const wrapper = mountMonth(ALL)
    const at = (emp: number, date: string) => wrapper.find(`[data-test="mcell-${emp}-${date}"]`)
    expect(at(1, '2026-10-01').text()).toBe('早車')
    expect(wrapper.find('[data-test="mdot-1-2026-10-01"]').classes()).toContain('month-grid__dot--red')
    expect(wrapper.find('[data-test="mdot-1-2026-10-02"]').classes()).toContain('month-grid__dot--orange')
    expect(at(1, '2026-10-05').text()).toBe('假')
    expect(wrapper.find('[data-test="mdot-1-2026-10-05"]').classes()).toContain('month-grid__dot--blue')
    expect(wrapper.find('[data-test="mdot-2-2026-10-01"]').exists()).toBe(false)
    expect(at(1, '2026-10-06').text()).toBe('晚車')
    expect(at(1, '2026-10-06').classes()).toContain('month-grid__cell--future')
    // 色點以外要有文字：aria-label 帶判定
    expect(at(1, '2026-10-01').attributes('aria-label')).toContain('出勤異常')
  })

  it('點格送出 select；不在職的格子不能點', async () => {
    const wrapper = mountMonth(ALL)
    await wrapper.find('[data-test="mcell-1-2026-10-02"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1, '2026-10-02']])
    expect(wrapper.find('[data-test="mcell-2-2026-10-06"]').attributes('disabled')).toBeDefined()
  })

  it('只看待處理與人員搜尋套用在整月；沒有符合時給空狀態', () => {
    expect(mountMonth(ALL, { filter: 'issues' }).findAll('[data-test^="mrow-"]').map((r) => r.attributes('data-test'))).toEqual(['mrow-1'])
    expect(mountMonth(ALL, { keyword: 'e002' }).findAll('[data-test^="mrow-"]').map((r) => r.attributes('data-test'))).toEqual(['mrow-2'])
    expect(mountMonth(ALL, { keyword: '不存在' }).text()).toContain('找不到符合的人員')
  })
})

describe('MonthGrid 狀態點不只靠顏色', () => {
  // 紅、橘兩色彼此對比只有約 1.3:1：用形狀區分（紅＝實心圓、橘＝空心圈、藍＝方塊），圖例同一套 class
  const css = readFileSync(resolve(__dirname, '../MonthGrid.vue'), 'utf8')
  const rule = (cls: string) => css.match(new RegExp(`\\.${cls} \\{([^}]*)\\}`))?.[1] ?? ''
  it('橘色是空心圈、藍色是方塊、紅色是實心圓', () => {
    expect(rule('month-grid__dot--orange')).toMatch(/background: transparent/)
    expect(rule('month-grid__dot--orange')).toMatch(/border: 2px solid var\(--color-warning-darker\)/)
    expect(rule('month-grid__dot--blue')).toMatch(/border-radius: 1px/)
    expect(rule('month-grid__dot--red')).toMatch(/background: var\(--color-danger-darker\)/)
  })
})

describe('MonthGrid 第五輪審查', () => {
  it('符合整月型態的格子：紅點降為橘點（一整排紅點多半只是一個設定錯），報讀寫出可能是設定問題', () => {
    const cells = [cell(1, '2026-10-01', { actual: { status: 'anomaly' } }), cell(1, '2026-10-02', { actual: { status: 'anomaly' } })]
    const wrapper = mountMonth(cells, { patternKeys: new Set(['1|2026-10-01']) })
    expect(wrapper.get('[data-test="mdot-1-2026-10-01"]').classes()).toContain('month-grid__dot--orange')
    expect(wrapper.get('[data-test="mcell-1-2026-10-01"]').attributes('aria-label')).toContain('可能是設定問題')
    expect(wrapper.get('[data-test="mdot-1-2026-10-02"]').classes()).toContain('month-grid__dot--red')
    expect(wrapper.get('[data-test="month-legend"]').text()).toContain('待修設定')
  })

  it('列首型態註記是按鈕，點了開本月設定檢查', async () => {
    const wrapper = mountMonth(ALL, { personNotes: { 1: { tag: '時段可能設錯', detail: '每天遲到' } } })
    const note = wrapper.get('[data-test="mperson-note-1"]')
    expect(note.element.tagName).toBe('BUTTON')
    await note.trigger('click')
    expect(wrapper.emitted('show-patterns')).toHaveLength(1)
  })
})
