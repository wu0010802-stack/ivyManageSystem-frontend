import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import MonthGrid from '../MonthGrid.vue'
import { cell, day, employee, grid } from './gridFixtures'
import { indexCells, VERDICT_KIND_LABELS, type GridCell } from '@/utils/scheduleAttendanceGrid'

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
    // 報讀不寫「排班」（排班是另一個頁籤；點了是回核對的週檢視）
    expect(wrapper.find('[data-test="month-week-2026-09-28"]').attributes('aria-label')).toBe('看 10/1–10/2 這週')
    await wrapper.find('[data-test="month-week-2026-09-28"]').trigger('click')
    await wrapper.find('[data-test="month-week-2026-10-05"]').trigger('click')
    expect(wrapper.emitted('open-week')).toEqual([['2026-09-28'], ['2026-10-05']])
  })

  it('每格只放班別縮寫＋狀態點：依 verdictKind（扣款／換班待確認）與請假；全天假寫「假」；未來日淡色', () => {
    const wrapper = mountMonth(ALL)
    const at = (emp: number, date: string) => wrapper.find(`[data-test="mcell-${emp}-${date}"]`)
    expect(at(1, '2026-10-01').text()).toBe('早車')
    expect(wrapper.find('[data-test="mdot-1-2026-10-01"]').classes()).toContain('month-grid__dot--deduct')
    expect(wrapper.find('[data-test="mdot-1-2026-10-01"]').classes()).toContain('verdict-shape--deduct')
    expect(wrapper.find('[data-test="mdot-1-2026-10-02"]').classes()).toContain('month-grid__dot--confirm')
    expect(wrapper.find('[data-test="mdot-1-2026-10-02"]').classes()).toContain('verdict-shape--confirm')
    expect(at(1, '2026-10-05').text()).toBe('假')
    expect(wrapper.find('[data-test="mdot-1-2026-10-05"]').classes()).toContain('month-grid__dot--leave')
    expect(wrapper.find('[data-test="mdot-1-2026-10-05"]').classes()).toContain('verdict-shape--leave')
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

describe('MonthGrid 列篩選以人為單位', () => {
  // 林：唯一的待辦就是型態格（設定問題）；王：封存時沒處理的待辦
  const CELLS = [
    cell(1, '2026-10-01', { actual: { status: 'anomaly' } }),
    cell(1, '2026-10-02', { actual: {} }),
    cell(2, '2026-10-01', { actual: { status: 'anomaly' }, edit: { locked_reason: 'finalized' } }),
    cell(2, '2026-10-02', { actual: {} }),
  ]
  const patternProps = { patternKeys: new Set(['1|2026-10-01']), patternEmployeeIds: new Set([1]) }
  const rows = (props: Record<string, unknown>) => mountMonth(CELLS, { ...patternProps, ...props }).findAll('[data-test^="mrow-"]').map((r) => r.attributes('data-test'))

  it('有待辦不含只有設定問題格的人；設定問題看型態名單；封存時未處理看封存遺留', () => {
    expect(rows({ filter: 'all' })).toEqual(['mrow-1', 'mrow-2'])
    expect(rows({ filter: 'issues' })).toEqual([])
    expect(rows({ filter: 'patterns' })).toEqual(['mrow-1'])
    expect(rows({ filter: 'leftover' })).toEqual(['mrow-2'])
  })

  it('沒有符合的人時各自說明，不留空白', () => {
    expect(mountMonth(CELLS, { ...patternProps, filter: 'issues' }).get('.month-grid__empty').text()).toBe('這個月沒有人有待辦')
    expect(mountMonth(CELLS, { filter: 'patterns' }).get('.month-grid__empty').text()).toBe('這個月沒有設定問題的人')
    expect(mountMonth([cell(1, '2026-10-01', { actual: {} })], { filter: 'leftover' }).get('.month-grid__empty').text()).toBe('這個月沒有封存時未處理的人')
  })
})

describe('MonthGrid 狀態點不只靠顏色', () => {
  // 形狀是共用的全域 class（src/assets/main.css 的 .verdict-shape--*）：週格子、月格子、圖例同一套
  const css = readFileSync(resolve(__dirname, '../../../assets/main.css'), 'utf8')
  const rule = (cls: string) => css.match(new RegExp(`\\.${cls} \\{([^}]*)\\}`))?.[1] ?? ''
  it('扣款＝實心圓、缺卡＝空心圓（2px 邊）、換班待確認＝空心菱形、設定問題＝空心方形、資料待補＝實心橫條、請假＝實心小方塊', () => {
    expect(rule('verdict-shape')).toMatch(/width: 8px/)
    expect(rule('verdict-shape')).toMatch(/height: 8px/)
    expect(rule('verdict-shape--deduct')).toMatch(/border-radius: 50%/)
    expect(rule('verdict-shape--deduct')).toMatch(/background: var\(--verdict-shape-color\)/)
    expect(rule('verdict-shape--deduct')).toMatch(/--verdict-shape-color: var\(--color-danger-darker\)/)
    expect(rule('verdict-shape--missing')).toMatch(/border-radius: 50%/)
    expect(rule('verdict-shape--missing')).toMatch(/border: 2px solid var\(--verdict-shape-color\)/)
    expect(rule('verdict-shape--missing')).toMatch(/--verdict-shape-color: var\(--color-warning-darker\)/)
    expect(rule('verdict-shape--confirm')).toMatch(/transform: rotate\(45deg\)/)
    expect(rule('verdict-shape--confirm')).toMatch(/border: 2px solid var\(--verdict-shape-color\)/)
    expect(rule('verdict-shape--confirm')).toMatch(/--verdict-shape-color: var\(--color-verdict-confirm\)/)
    expect(rule('verdict-shape--setting')).toMatch(/border: 2px solid var\(--verdict-shape-color\)/)
    expect(rule('verdict-shape--setting')).toMatch(/--verdict-shape-color: var\(--color-verdict-setting\)/)
    // 資料待補：實心橫條（寬 8px 沿用基底、高 3px、圓角 1.5px），與設定問題的方形一眼分得出來；不是虛線、沒有邊框
    const pending = rule('verdict-shape--pending_data')
    expect(pending).toMatch(/height: 3px/)
    expect(pending).toMatch(/border-radius: 1\.5px/)
    expect(pending).toMatch(/background: var\(--verdict-shape-color\)/)
    expect(pending).toMatch(/--verdict-shape-color: var\(--el-text-color-secondary\)/)
    expect(pending).not.toMatch(/dashed|border:/)
    // 上下各留 2.5px：3px 橫條加起來仍佔 8px 行高，不改變週格子與圖例的排版
    expect(pending).toMatch(/margin-block: 2\.5px/)
    // 與設定問題（方形）形狀不同：方形是 8px 高的空心框，橫條只有 3px 高的實心
    expect(rule('verdict-shape--setting')).not.toMatch(/height:/)
    expect(rule('verdict-shape--setting')).toMatch(/border: 2px solid/)
    expect(rule('verdict-shape--leave')).toMatch(/background: var\(--verdict-shape-color\)/)
    expect(rule('verdict-shape--leave')).toMatch(/--verdict-shape-color: var\(--color-info-darker\)/)
  })

  it('封存時未處理＝中性灰的實心三角（形狀與其他六種都不同），只用既有的灰階 token，不用紅或待辦色', () => {
    const leftover = rule('verdict-shape--leftover')
    expect(leftover).toMatch(/--verdict-shape-color: var\(--el-text-color-secondary\)/)
    expect(leftover).toMatch(/background: var\(--verdict-shape-color\)/)
    expect(leftover).toMatch(/clip-path: polygon\(/)
    expect(leftover).not.toMatch(/danger|warning|verdict-confirm|verdict-setting|#[0-9a-f]{3,8}/i)
  })

  it('新 token 有亮色與暗色值（design-tokens.css／a11y.css 的 html.dark）', () => {
    const light = readFileSync(resolve(__dirname, '../../../assets/design-tokens.css'), 'utf8')
    const dark = readFileSync(resolve(__dirname, '../../../assets/a11y.css'), 'utf8')
    expect(light).toMatch(/--color-verdict-confirm: #0e7490;/)
    expect(light).toMatch(/--color-verdict-setting: #6d28d9;/)
    expect(dark).toMatch(/--color-verdict-confirm: #67e8f9;/)
    expect(dark).toMatch(/--color-verdict-setting: #c4b5fd;/)
  })
})

describe('MonthGrid 第五輪審查', () => {
  it('符合整月型態的格子：點是「設定問題」而不是扣款（一整排扣款點多半只是一個設定錯），報讀寫出可能是設定問題', () => {
    const cells = [cell(1, '2026-10-01', { actual: { status: 'anomaly' } }), cell(1, '2026-10-02', { actual: { status: 'anomaly' } })]
    const wrapper = mountMonth(cells, { patternKeys: new Set(['1|2026-10-01']) })
    expect(wrapper.get('[data-test="mdot-1-2026-10-01"]').classes()).toContain('month-grid__dot--setting')
    expect(wrapper.get('[data-test="mdot-1-2026-10-01"]').classes()).not.toContain('month-grid__dot--deduct')
    expect(wrapper.get('[data-test="mcell-1-2026-10-01"]').attributes('aria-label')).toContain('可能是設定問題')
    expect(wrapper.get('[data-test="mdot-1-2026-10-02"]').classes()).toContain('month-grid__dot--deduct')
  })

  it('圖例換成共用的 VerdictLegend：五類判定（含請假）文字都在，並保留月總覽唯讀提示', () => {
    const wrapper = mountMonth(ALL)
    const legend = wrapper.get('[data-test="month-legend"]')
    for (const label of Object.values(VERDICT_KIND_LABELS)) expect(legend.text()).toContain(label)
    expect(legend.text()).toContain('請假')
    expect(legend.find('.verdict-shape--leave').exists()).toBe(true)
    expect(legend.text()).toContain('月總覽唯讀；點週次看該週')
    expect(legend.text()).not.toContain('排班')
  })

  it('封存月：封存時沒處理的格子畫中性的 leftover 點，標明是封存時未處理；封存時沒事的格子沒有點', () => {
    const sealed = { locked_reason: 'finalized' as const }
    const cells = [
      cell(1, '2026-10-01', { actual: { status: 'anomaly' }, edit: sealed }),
      cell(1, '2026-10-02', { actual: { status: 'matched' }, edit: sealed }),
      cell(1, '2026-10-05', { actual: { status: 'matched' }, edit: sealed, leaves: [LEAVE] }),
    ]
    const wrapper = mountMonth(cells)
    const dot = wrapper.get('[data-test="mdot-1-2026-10-01"]')
    expect(dot.classes()).toContain('month-grid__dot--leftover')
    expect(dot.classes()).toContain('verdict-shape--leftover')
    // 不是任何一類待辦的點
    for (const kind of ['deduct', 'missing', 'confirm', 'setting', 'pending_data']) expect(dot.classes()).not.toContain(`month-grid__dot--${kind}`)
    expect(dot.attributes('title')).toBe('封存時未處理：出勤異常')
    // 色點以外要有文字：整格的報讀也寫出
    expect(wrapper.get('[data-test="mcell-1-2026-10-01"]').attributes('aria-label')).toContain('封存時未處理：出勤異常')
    expect(wrapper.get('[data-test="mcell-1-2026-10-01"]').attributes('aria-label')).not.toContain('，出勤異常')
    expect(wrapper.find('[data-test="mdot-1-2026-10-02"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="mdot-1-2026-10-05"]').classes()).toContain('month-grid__dot--leave')
    expect(wrapper.get('[data-test="mcell-1-2026-10-02"]').attributes('aria-label')).not.toContain('封存時未處理')
  })

  it('封存時未處理的點只因老師確認未處理而來：說明寫老師確認的狀態', () => {
    const sealed = { locked_reason: 'finalized' as const }
    const pending = { item_id: 1, round_id: 1, kind: 'swap', status: 'pending', partner_employee_id: 2 } as const
    const wrapper = mountMonth([cell(1, '2026-10-01', { actual: {}, confirmation: pending, edit: sealed })])
    expect(wrapper.get('[data-test="mdot-1-2026-10-01"]').attributes('title')).toBe('封存時未處理：老師確認：待回覆')
  })

  it('leftover 篩選的月檢視：留下的人，遺留的那幾天有點', () => {
    const sealed = { locked_reason: 'finalized' as const }
    const cells = [
      cell(1, '2026-10-01', { actual: {} }),
      cell(1, '2026-10-02', { actual: { status: 'missing_punch' }, edit: sealed }),
      cell(2, '2026-10-01', { actual: {} }),
    ]
    const wrapper = mountMonth(cells, { filter: 'leftover' })
    expect(wrapper.findAll('[data-test^="mrow-"]').map((r) => r.attributes('data-test'))).toEqual(['mrow-1'])
    expect(wrapper.findAll('[data-test^="mdot-"]').map((d) => d.attributes('data-test'))).toEqual(['mdot-1-2026-10-02'])
    expect(wrapper.get('[data-test="mdot-1-2026-10-02"]').attributes('title')).toBe('封存時未處理：缺卡待確認')
  })

  it('圖例：有封存時未處理的點才多一項說明，沒有就不出現', () => {
    const sealed = { locked_reason: 'finalized' as const }
    const withLeftover = mountMonth([cell(1, '2026-10-01', { actual: { status: 'anomaly' }, edit: sealed })])
    expect(withLeftover.get('[data-test="month-legend"]').text()).toContain('封存時未處理（只能看）')
    expect(mountMonth(ALL).get('[data-test="month-legend"]').text()).not.toContain('封存時未處理')
  })

  it('列首型態註記是按鈕，點了開本月設定檢查', async () => {
    const wrapper = mountMonth(ALL, { personNotes: { 1: { tag: '時段可能設錯', detail: '每天遲到' } } })
    const note = wrapper.get('[data-test="mperson-note-1"]')
    expect(note.element.tagName).toBe('BUTTON')
    await note.trigger('click')
    expect(wrapper.emitted('show-patterns')).toHaveLength(1)
  })
})

describe('MonthGrid 1280 寬放得下整月（第六輪）', () => {
  // 10/2 週五、10/3 週六、10/4 週日、10/9 週五（放假）、10/12 週一
  const MIX_DAYS = [
    day('2026-10-02'),
    day('2026-10-03'),
    day('2026-10-04'),
    day('2026-10-09', { is_holiday: true, is_workday: false, holiday_name: '國慶日補假' }),
    day('2026-10-12'),
  ]
  const MIX_CELLS = [
    cell(1, '2026-10-02', { plan: { name: '早車' } }),
    // 週六有人上班且當天異常：欄很窄，格內只放點，不放縮寫
    cell(1, '2026-10-03', { plan: { name: '早車', expected: true }, actual: { status: 'anomaly' } }),
    cell(1, '2026-10-04', { plan: { expected: false } }),
    cell(1, '2026-10-09', { plan: { expected: false }, leaves: [LEAVE] }),
    cell(1, '2026-10-12', { plan: { name: '早車' } }),
  ]
  const mountMix = () => {
    const g = grid({ days: MIX_DAYS, cells: MIX_CELLS, today: '2026-10-12', employees: [employee(1, '林班導')] })
    return mount(MonthGrid, { props: { groups: g.groups, employees: g.employees, days: g.days, cells: indexCells(g.cells), today: g.today, filter: 'all' } })
  }
  const css = readFileSync(resolve(__dirname, '../MonthGrid.vue'), 'utf8')

  it('非工作日（週末、假日）的欄頭與格子都加 month-grid__day--off；工作日不加', () => {
    const wrapper = mountMix()
    const heads = wrapper.findAll('thead th.month-grid__day').map((th) => th.classes().includes('month-grid__day--off'))
    expect(heads).toEqual([false, true, true, true, false])
    const cellWrap = (date: string) => wrapper.get(`[data-test="mcell-1-${date}"]`).element.parentElement!
    expect(['2026-10-03', '2026-10-04', '2026-10-09'].map((d) => cellWrap(d).classList.contains('month-grid__day--off'))).toEqual([true, true, true])
    expect(['2026-10-02', '2026-10-12'].map((d) => cellWrap(d).classList.contains('month-grid__day--off'))).toEqual([false, false])
    // 假日名仍在欄頭 title
    expect(wrapper.findAll('thead th.month-grid__day')[3].attributes('title')).toBe('國慶日補假')
  })

  it('非工作日的格子不放文字只放點（欄只有 20px 寬）；工作日的格子照舊放縮寫', () => {
    const wrapper = mountMix()
    const sat = wrapper.get('[data-test="mcell-1-2026-10-03"]')
    expect(sat.find('.month-grid__abbr').exists()).toBe(false)
    expect(sat.text()).toBe('')
    expect(wrapper.find('[data-test="mdot-1-2026-10-03"]').classes()).toContain('month-grid__dot--deduct')
    // 放假日請假的點也在
    expect(wrapper.find('[data-test="mdot-1-2026-10-09"]').classes()).toContain('month-grid__dot--leave')
    // 報讀仍念得到計畫（不靠格內文字）
    expect(sat.attributes('aria-label')).toContain('早車')
    expect(wrapper.get('[data-test="mcell-1-2026-10-02"]').text()).toBe('早車')
  })

  it('人員欄：姓名單行省略（title 為全名）、職稱在第二行', () => {
    const th = mountMix().get('th.month-grid__person')
    const name = th.get('.month-grid__name')
    expect(name.text()).toBe('林班導')
    expect(name.attributes('title')).toBe('林班導')
    expect(th.get('.month-grid__role').text()).toBe('班導')
    const rule = (cls: string) => css.match(new RegExp(`\\.${cls} \\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule('month-grid__name')).toContain('text-overflow: ellipsis')
    expect(rule('month-grid__name')).toContain('white-space: nowrap')
    expect(rule('month-grid__role')).toContain('display: block')
    expect(rule('month-grid__role')).toContain('font-size: var(--text-xs)') // 12px
  })

  it('欄寬下限：人員 88、工作日 30、非工作日 20、格高 36；30 欄（20 工作日＋10 非工作日）合計放得進 1280 寬的內容區（約 924px）', () => {
    const px = (re: RegExp) => Number(css.match(re)![1])
    const person = px(/\.month-grid__person \{[^}]*min-width: (\d+)px/)
    const weekday = px(/\.month-grid__day \{[^}]*min-width: (\d+)px/)
    const off = px(/\.month-grid__day--off \{[^}]*min-width: (\d+)px/)
    expect([person, weekday, off]).toEqual([88, 30, 20])
    expect(px(/\.month-grid__cell \{[^}]*min-height: (\d+)px/)).toBe(36)
    expect(person + weekday * 20 + off * 10).toBeLessThanOrEqual(924)
  })
})
