import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ShiftGrid from '../ShiftGrid.vue'
import { addDaysISO, indexCells, SOURCE_TAGS, visibleDays, type GridCell, type GridFilter } from '@/utils/scheduleAttendanceGrid'
import { cell, day, employee, grid, SHIFTS, WEEK } from './gridFixtures'

const TODAY = '2026-09-17'

function cellsFor(overrides: Record<string, Parameters<typeof cell>[2]> = {}): GridCell[] {
  return [1, 2, 3].flatMap((id) =>
    WEEK.map((date) => cell(id, date, overrides[`${id}|${date}`] ?? { plan: { expected: day(date).is_workday } })),
  )
}

function mountGrid(opts: {
  /** 核對（預設）／排班 */
  mode?: 'reconcile' | 'plan'
  changedIds?: ReadonlySet<number>
  cells?: GridCell[]
  filter?: GridFilter
  keyword?: string
  canEditPlan?: boolean
  mobile?: boolean
  today?: string
  /** 可排班者：週末沒人排班也顯示 7 欄 */
  showAllDays?: boolean
  coverage?: Array<{ date: string; leaves: never[]; gaps: Array<Record<string, unknown>> }>
  days?: ReturnType<typeof day>[]
  canImport?: boolean
  maxHeight?: number
  personNotes?: Record<number, { tag: string; detail: string }>
  patternKeys?: ReadonlySet<string>
  patternEmployeeIds?: ReadonlySet<number>
  attach?: boolean
} = {}) {
  const g = grid({
    ...(opts.days ? { days: opts.days } : {}),
    employees: [
      employee(1, '林班導'),
      employee(2, '王副導', { role_label: '副班導' }),
      employee(3, '李廚工', { group_key: 'other', role_label: '廚工' }),
    ],
    cells: opts.cells ?? cellsFor(),
  })
  return mount(ShiftGrid, {
    props: {
      mode: opts.mode ?? 'reconcile',
      changedIds: opts.changedIds,
      groups: g.groups,
      employees: g.employees,
      days: visibleDays(g.days, g.cells, opts.showAllDays),
      cells: indexCells(g.cells),
      today: opts.today ?? TODAY,
      filter: opts.filter ?? 'all',
      keyword: opts.keyword,
      canEditPlan: opts.canEditPlan ?? true,
      shiftOptions: SHIFTS.filter((s) => s.is_active),
      weeklyValue: (id: number) => (id === 1 ? 1 : null),
      coverage: opts.coverage as never,
      mobile: opts.mobile ?? false,
      canImport: opts.canImport ?? false,
      maxHeight: opts.maxHeight,
      personNotes: opts.personNotes,
      patternKeys: opts.patternKeys,
      patternEmployeeIds: opts.patternEmployeeIds,
    },
    ...(opts.attach ? { attachTo: document.body } : {}),
    global: { plugins: [ElementPlus] },
  })
}

describe('ShiftGrid 桌機', () => {
  it('依班級分組、平日五欄、每格顯示來源＋計畫', () => {
    const wrapper = mountGrid()
    const groups = wrapper.findAll('.shift-grid__group').map((w) => w.text())
    expect(groups).toEqual(['滿天星', '行政／後勤'])
    expect(wrapper.findAll('thead th.shift-grid__day')).toHaveLength(5)
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).text()).toContain('週 早車 07:00–16:30')
  })

  it('七欄時非工作日（週末）的欄頭與格子加淡色 class，工作日不加', () => {
    const wrapper = mountGrid({ showAllDays: true })
    expect(wrapper.findAll('thead th.shift-grid__day')).toHaveLength(7)
    expect(wrapper.find(`[data-test="day-${WEEK[5]}"]`).classes()).toContain('shift-grid__day--off')
    expect(wrapper.find(`[data-test="day-${WEEK[0]}"]`).classes()).not.toContain('shift-grid__day--off')
    expect(wrapper.find(`[data-test="cell-1-${WEEK[6]}"]`).element.parentElement!.classList).toContain('shift-grid__cell-wrap--off')
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).element.parentElement!.classList).not.toContain('shift-grid__cell-wrap--off')
  })

  it('週末有人打卡就出現該欄', () => {
    const wrapper = mountGrid({
      today: '2026-09-21',
      cells: cellsFor({ [`2|${WEEK[5]}`]: { plan: { expected: false }, actual: { punch_in: `${WEEK[5]}T09:00:00`, punch_out: `${WEEK[5]}T12:00:00`, status: 'unscheduled_attendance' } } }),
    })
    expect(wrapper.find(`[data-test="day-${WEEK[5]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="cell-2-${WEEK[5]}"]`).text()).toContain('非原排班出勤')
  })

  it('只看有問題：只留下有過去異常的人', () => {
    const wrapper = mountGrid({
      filter: 'issues',
      cells: cellsFor({ [`2|${WEEK[0]}`]: { actual: { status: 'anomaly', punch_in: `${WEEK[0]}T08:30:00`, punch_out: `${WEEK[0]}T18:00:00` } } }),
    })
    expect(wrapper.find('[data-test="row-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="row-2"]').exists()).toBe(true)
    expect(wrapper.find(`[data-test="cell-2-${WEEK[0]}"]`).classes()).toContain('shift-grid__cell--k-deduct')
  })

  it('列篩選以人為單位：有待辦不含只有設定問題格的人；設定問題看型態名單；封存時未處理看封存遺留', () => {
    const ANOMALY = { status: 'anomaly' as const }
    // 林：唯一的待辦是型態格；王：一筆逐日待辦；李：封存時沒處理
    const cells = cellsFor({
      [`1|${WEEK[0]}`]: { actual: ANOMALY },
      [`2|${WEEK[1]}`]: { actual: ANOMALY },
      [`3|${WEEK[2]}`]: { actual: ANOMALY, edit: { locked_reason: 'finalized' } },
    })
    const patternProps = { patternKeys: new Set([`1|${WEEK[0]}`]), patternEmployeeIds: new Set([1]) }
    const rows = (filter: GridFilter) => mountGrid({ cells, filter, ...patternProps }).findAll('[data-test^="row-"]').map((r) => r.attributes('data-test'))
    expect(rows('all')).toEqual(['row-1', 'row-2', 'row-3'])
    expect(rows('issues')).toEqual(['row-2'])
    expect(rows('patterns')).toEqual(['row-1'])
    expect(rows('leftover')).toEqual(['row-3'])
  })

  it('退到背景的格子跟著篩選走：有待辦＝非型態的待辦格才不退；設定問題＝只有型態格不退；封存時未處理＝只有封存遺留不退；全部不退', () => {
    const ANOMALY = { status: 'anomaly' as const }
    const SEALED = { locked_reason: 'finalized' as const }
    // 林：9/14 型態格、9/15 逐日待辦、9/16 沒事；李（封存）：9/14 封存時沒處理、9/15 封存時沒事
    const cells = cellsFor({
      [`1|${WEEK[0]}`]: { actual: ANOMALY },
      [`1|${WEEK[1]}`]: { actual: ANOMALY },
      [`1|${WEEK[2]}`]: { actual: { status: 'matched' } },
      [`3|${WEEK[0]}`]: { actual: ANOMALY, edit: SEALED },
      [`3|${WEEK[1]}`]: { actual: { status: 'matched' }, edit: SEALED },
    })
    const patternProps = { patternKeys: new Set([`1|${WEEK[0]}`]), patternEmployeeIds: new Set([1]) }
    const quiet = (filter: GridFilter, emp: number, date: string) =>
      mountGrid({ cells, filter, ...patternProps }).get(`[data-test="cell-${emp}-${date}"]`).classes().includes('shift-grid__cell--quiet')

    // 有待辦：型態格退背景（它算設定問題），逐日待辦不退，沒事的退
    expect([quiet('issues', 1, WEEK[0]), quiet('issues', 1, WEEK[1]), quiet('issues', 1, WEEK[2])]).toEqual([true, false, true])
    // 設定問題：只有型態格不退，同列的逐日待辦也退
    expect([quiet('patterns', 1, WEEK[0]), quiet('patterns', 1, WEEK[1]), quiet('patterns', 1, WEEK[2])]).toEqual([false, true, true])
    // 封存時未處理：只有封存遺留不退，封存時沒事的退
    expect([quiet('leftover', 3, WEEK[0]), quiet('leftover', 3, WEEK[1])]).toEqual([false, true])
    // 全部、只看未來可排：維持原樣，沒有格子退背景
    expect(quiet('all', 1, WEEK[2])).toBe(false)
    expect(quiet('future', 1, WEEK[4])).toBe(false)
  })

  it('沒有符合的人時各自說明', () => {
    expect(mountGrid({ filter: 'issues' }).get('.shift-grid__empty').text()).toBe('這段期間沒有人有待辦')
    expect(mountGrid({ filter: 'patterns' }).get('.shift-grid__empty').text()).toBe('這段期間沒有設定問題的人')
    expect(mountGrid({ filter: 'leftover' }).get('.shift-grid__empty').text()).toBe('這段期間沒有封存時未處理的人')
  })

  it('整天未匯入的日子：格子寫「未匯入」、不算待處理；整週都被篩掉時說明要先匯入並給入口', async () => {
    const NONE = { status: 'data_incomplete' as const, punch_in: null, punch_out: null }
    const days = WEEK.map((d, i) => day(d, { import_covered: i === 0 }))
    const cells = cellsFor({ [`1|${WEEK[1]}`]: { actual: NONE } })
    const all = mountGrid({ cells, days })
    expect(all.find(`[data-test="cell-1-${WEEK[1]}"]`).text()).toContain('未匯入')
    expect(all.find(`[data-test="cell-1-${WEEK[1]}"]`).classes()).toContain('shift-grid__cell--awaiting_import')

    const issues = mountGrid({ cells, days, filter: 'issues', canImport: true })
    expect(issues.find('[data-test="row-1"]').exists()).toBe(false)
    expect(issues.text()).toContain('有 2 天打卡還沒匯入') // 9/15、9/16（今天 9/17 不算）
    await issues.find('[data-test="grid-empty-import"]').trigger('click')
    // 帶第一個缺的日子：跨月週時頁面才知道要開哪個月的匯入（審查 F3）
    expect(issues.emitted('import-punches')).toEqual([[WEEK[1]]])
    expect(mountGrid({ cells, days, filter: 'issues' }).find('[data-test="grid-empty-import"]').exists()).toBe(false)
  })

  it('捲動容器高度由面板量測後帶入（工具列換行時表頭不蓋住儲存鈕）', () => {
    const wrapper = mountGrid({ maxHeight: 512 })
    expect((wrapper.find('.shift-grid__scroller').element as HTMLElement).style.maxHeight).toBe('512px')
    expect((mountGrid().find('.shift-grid__scroller').element as HTMLElement).style.maxHeight).toBe('')
  })

  it('狀態色：不用側邊色條；判定文字用達 AA 的深色 token；未來格不像停用', () => {
    const css = readFileSync(resolve(__dirname, '../ShiftGrid.vue'), 'utf8')
    expect(css).not.toMatch(/border-left:\s*[2-9]px/)
    // 判定只在「・」之間換行（每段不拆）：整串不換行會把欄寬撐開，1440 寬時週末欄被擠出畫面
    expect(css).toMatch(/\.shift-grid__verdict-part \{[^}]*white-space: nowrap/)
    expect(css).not.toMatch(/\.shift-grid__plan-time, \.shift-grid__verdict \{[^}]*white-space: nowrap/)
    // 判定字色依 verdictKind（形狀＋顏色五類）；扣款＝danger、缺卡＝warning、等老師＝青、設定問題＝紫、資料待補＝次要灰
    expect(css).toMatch(/\.shift-grid__cell--k-deduct \{[^}]*--verdict-color: var\(--color-danger-darker\)/)
    expect(css).toMatch(/\.shift-grid__cell--k-missing \{[^}]*--verdict-color: var\(--color-warning-darker\)/)
    expect(css).toMatch(/\.shift-grid__cell--k-confirm \{[^}]*--verdict-color: var\(--color-verdict-confirm\)/)
    expect(css).toMatch(/\.shift-grid__cell--k-setting \{[^}]*--verdict-color: var\(--color-verdict-setting\)/)
    expect(css).toMatch(/\.shift-grid__cell--k-pending_data \{[^}]*--verdict-color: var\(--el-text-color-secondary\)/)
    // 封存格的判定字與形狀一律中性灰，且規則排在各 kind 之後才蓋得過
    expect(css).toMatch(/\.shift-grid__cell--sealed \{[^}]*--verdict-color: var\(--el-text-color-secondary\)/)
    expect(css.indexOf('.shift-grid__cell--sealed {')).toBeGreaterThan(css.indexOf('.shift-grid__cell--k-pending_data {'))
    expect(css).toMatch(/\.shift-grid__cell--sealed \.verdict-shape \{[^}]*--verdict-shape-color: var\(--el-text-color-secondary\)/)
    // 舊的紅／橘 tone class 與降色已移除
    expect(css).not.toMatch(/shift-grid__cell--(danger|warning)/)
    expect(css).not.toMatch(/color: var\(--el-color-warning\)/)
    expect(css).not.toMatch(/\.shift-grid__cell--future \{[^}]*color: var\(--el-text-color-secondary\)/)
  })

  it('只看未來可排：只留今天以後的欄（過去的格子不能排，留著只是干擾）', () => {
    const wrapper = mountGrid({ filter: 'future', cells: cellsFor(Object.fromEntries(WEEK.map((d) => [`1|${d}`, { plan: { expected: day(d).is_workday }, edit: { plan: d > TODAY } }]))) })
    const heads = wrapper.findAll('thead th.shift-grid__day').map((th) => th.attributes('data-test'))
    expect(heads).toEqual(['day-2026-09-18'])
  })

  it('手機「只看未來可排」：日期頁籤也只列今天以後（審查 F10）', () => {
    const wrapper = mountGrid({ mobile: true, filter: 'future', cells: cellsFor(Object.fromEntries(WEEK.map((d) => [`1|${d}`, { plan: { expected: day(d).is_workday }, edit: { plan: d > TODAY } }]))) })
    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.attributes('data-test'))
    expect(tabs[0]).toBe('mobile-day-2026-09-18')
    expect(tabs.every((t) => t! > 'mobile-day-2026-09-17')).toBe(true)
    expect(wrapper.find('[data-test="mobile-day-2026-09-18"]').attributes('aria-selected')).toBe('true')
  })

  it('表格有說明用的 caption（螢幕閱讀器先知道列與欄是什麼）', () => {
    expect(mountGrid().find('caption').text()).toContain('列為人員')
  })

  it('今天那一欄的欄頭標「今天」', () => {
    const wrapper = mountGrid()
    expect(wrapper.find(`[data-test="day-${TODAY}"]`).text()).toContain('今天')
    expect(wrapper.find(`[data-test="day-${WEEK[0]}"]`).text()).not.toContain('今天')
  })

  it('格子兩行：第一行計畫，第二行打卡與判定並排（列高不被三行撐高）', () => {
    const wrapper = mountGrid({
      cells: cellsFor({ [`1|${WEEK[0]}`]: { actual: { status: 'anomaly', punch_in: `${WEEK[0]}T08:30:00`, punch_out: `${WEEK[0]}T18:00:00` } } }),
    })
    const result = wrapper.find(`[data-test="cell-1-${WEEK[0]}"] .shift-grid__result`)
    expect(result.find('.shift-grid__actual').text()).toBe('08:30–18:00')
    expect(result.find('.shift-grid__verdict').text()).toBe('出勤異常')
  })

  it('捲動時日期表頭與人員欄固定：表格在限高的捲動容器內，表頭 sticky top、人員欄 sticky left', () => {
    const css = readFileSync(resolve(__dirname, '../ShiftGrid.vue'), 'utf8')
    const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}[^{]*\\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule('.shift-grid__scroller')).toMatch(/max-height:/)
    expect(rule('.shift-grid__scroller')).toMatch(/overflow: auto/)
    expect(rule('.shift-grid__table thead th')).toMatch(/position: sticky/)
    expect(rule('.shift-grid__table thead th')).toMatch(/top: 0/)
    // 不擋捲動傳遞：表格捲到底要能接著捲外層，否則容器下緣與水平捲軸要把游標移出表格才捲得到（審查 F9）
    expect(rule('.shift-grid__scroller')).not.toMatch(/overscroll-behavior/)
    expect(css).toMatch(/\.shift-grid__person[^{]*\{[^}]*position: sticky[^}]*left: 0/)
  })

  it('關鍵字搜尋：姓名包含（不分大小寫、前後空白忽略）', () => {
    const wrapper = mountGrid({ keyword: ' 王副 ' })
    expect(wrapper.find('[data-test="row-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="row-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="row-3"]').exists()).toBe(false)
    // 沒有人員的班級分組標題也不留
    expect(wrapper.findAll('.shift-grid__group').map((w) => w.text())).toEqual(['滿天星'])
  })

  it('關鍵字搜尋：工號包含（不分大小寫）', () => {
    const wrapper = mountGrid({ keyword: 'e003' })
    expect(wrapper.find('[data-test="row-3"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="row-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="row-2"]').exists()).toBe(false)
  })

  it('關鍵字沒有符合者：顯示「找不到符合的人員」；清空關鍵字恢復全部', async () => {
    const wrapper = mountGrid({ keyword: '不存在的人' })
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(false)
    expect(wrapper.find('.shift-grid__empty').text()).toBe('找不到符合的人員')
    await wrapper.setProps({ keyword: '' })
    expect(wrapper.findAll('tbody tr[data-test^="row-"]')).toHaveLength(3)
  })

  it('關鍵字與「只看有問題」並用：兩個條件都要符合', () => {
    const issueCells = cellsFor({ [`2|${WEEK[0]}`]: { actual: { status: 'anomaly', punch_in: `${WEEK[0]}T08:30:00`, punch_out: `${WEEK[0]}T18:00:00` } } })
    expect(mountGrid({ filter: 'issues', keyword: '王', cells: issueCells }).find('[data-test="row-2"]').exists()).toBe(true)
    const none = mountGrid({ filter: 'issues', keyword: '林', cells: issueCells })
    expect(none.find('[data-test="row-1"]').exists()).toBe(false)
    expect(none.find('.shift-grid__empty').text()).toBe('找不到符合的人員')
  })

  it('點格子送出 select；不在職的格子不可點', async () => {
    const wrapper = mountGrid({ cells: cellsFor({ [`3|${WEEK[0]}`]: { employed: false } }) })
    await wrapper.find(`[data-test="cell-1-${WEEK[1]}"]`).trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1, WEEK[1]]])
    expect(wrapper.find(`[data-test="cell-3-${WEEK[0]}"]`).attributes('disabled')).toBeDefined()
  })

  it('排班：本週班別下拉只在可改計畫時出現，改值送出 weekly-change', async () => {
    const wrapper = mountGrid({ mode: 'plan' })
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(wrapper.find('[data-test="weekly-1"]').exists()).toBe(true)
    select.vm.$emit('update:modelValue', 2)
    expect(wrapper.emitted('weekly-change')).toEqual([[1, 2]])
    select.vm.$emit('update:modelValue', undefined)
    expect(wrapper.emitted('weekly-change')?.[1]).toEqual([1, null])
    expect(mountGrid({ mode: 'plan', canEditPlan: false }).find('[data-test="weekly-1"]').exists()).toBe(false)
  })

  it('排班：欄頭顯示空班警示', () => {
    const wrapper = mountGrid({
      mode: 'plan',
      coverage: [{
        date: WEEK[2],
        leaves: [],
        gaps: [{ shiftTypeId: 1, shiftTypeName: '早車', workStart: '07:00', workEnd: '16:30', scheduledCount: 1, absentNames: ['林班導'], severity: 'empty' }],
      }],
    })
    expect(wrapper.find(`[data-test="gap-${WEEK[2]}"]`).text()).toBe('早車無人上班')
  })
})

describe('ShiftGrid 標記', () => {
  it('請假（含待審）、老師確認進行中、過去未匯入的日子都標在格子或欄頭', () => {
    const g = grid()
    const wrapper = mount(ShiftGrid, {
      props: {
        mode: 'reconcile',
        groups: g.groups,
        employees: g.employees,
        days: [day(WEEK[0], { import_covered: false }), day(WEEK[1]), day(WEEK[4], { import_covered: false })],
        cells: indexCells([
          cell(1, WEEK[0], { leaves: [{ leave_id: 3, leave_type_label: '事假', status: 'pending', is_full_day: false, start_time: '13:00', end_time: '17:00' }] }),
          cell(1, WEEK[1], { actual: {}, confirmation: { item_id: 9, round_id: 2, kind: 'swap', status: 'pending', partner_employee_id: 2 } }),
          cell(1, WEEK[4]),
          cell(2, WEEK[0]), cell(2, WEEK[1]), cell(2, WEEK[4]),
        ]),
        today: TODAY,
        filter: 'all',
        canEditPlan: false,
        shiftOptions: SHIFTS,
        weeklyValue: () => null,
      },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).text()).toContain('事假（待審）')
    expect(wrapper.find(`[data-test="cell-1-${WEEK[1]}"] .shift-grid__confirm`).text()).toBe('老師確認：待回覆')
    expect(wrapper.find(`[data-test="not-imported-${WEEK[0]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="not-imported-${WEEK[4]}"]`).exists()).toBe(false) // 未來日不標
  })

  it('週末沒人打卡不是「未匯入」：欄頭只標工作日', () => {
    const days = WEEK.map((date) => day(date, { import_covered: false }))
    const wrapper = mountGrid({ days, showAllDays: true, today: '2026-09-21' })
    expect(wrapper.find(`[data-test="not-imported-${WEEK[0]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="not-imported-${WEEK[5]}"]`).exists()).toBe(false)
    expect(wrapper.find(`[data-test="not-imported-${WEEK[6]}"]`).exists()).toBe(false)
  })
})

describe('ShiftGrid 判定分段', () => {
  it('「遲到 N 分・早退 M 分」拆成兩段，每段不折行', () => {
    const cells = cellsFor({ [`1|${WEEK[0]}`]: { actual: { status: 'anomaly', punch_in: `${WEEK[0]}T07:57:00`, punch_out: `${WEEK[0]}T10:48:00`, late_minutes: 57, early_leave_minutes: 342 } } })
    const verdict = mountGrid({ cells }).get(`[data-test="cell-1-${WEEK[0]}"] .shift-grid__verdict`)
    expect(verdict.findAll('.shift-grid__verdict-part').map((p) => p.text())).toEqual(['遲到 57 分・', '早退 342 分'])
    expect(verdict.text()).toBe('遲到 57 分・早退 342 分')
  })
})

describe('ShiftGrid 人員註記（本月型態）', () => {
  const NOTES = { 2: { tag: '本月沒有打卡', detail: '本月 20 個應上班日都沒有打卡' } }

  it('桌機人員欄與手機卡片都寫出註記，滑鼠移上去看整句', () => {
    const desk = mountGrid({ personNotes: NOTES })
    const note = desk.get('[data-test="person-note-2"]')
    expect(note.text()).toBe('本月沒有打卡')
    expect(note.attributes('title')).toBe('本月 20 個應上班日都沒有打卡')
    expect(desk.find('[data-test="person-note-1"]').exists()).toBe(false)
    expect(mountGrid({ personNotes: NOTES, mobile: true }).find('[data-test="person-note-2"]').exists()).toBe(true)
  })
})

describe('ShiftGrid 手機', () => {
  it('選一天後列出人員卡片，點卡片送出 select', async () => {
    const wrapper = mountGrid({ mobile: true })
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(false)
    await wrapper.find(`[data-test="mobile-day-${WEEK[2]}"]`).trigger('click')
    await wrapper.find('[data-test="card-2"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2, WEEK[2]]])
  })

  it('手機卡片與桌機共用同一份關鍵字篩選', () => {
    const wrapper = mountGrid({ mobile: true, keyword: '李' })
    expect(wrapper.find('[data-test="card-3"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="card-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="card-2"]').exists()).toBe(false)
    expect(mountGrid({ mobile: true, keyword: 'zzz' }).find('.shift-grid__empty').text()).toBe('找不到符合的人員')
  })

  it('可排班者的日期頁籤也是 7 天，點週六可選到週六的人員卡片', async () => {
    const wrapper = mountGrid({ mobile: true, showAllDays: true })
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(7)
    await wrapper.find(`[data-test="mobile-day-${WEEK[5]}"]`).trigger('click')
    await wrapper.find('[data-test="card-1"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1, WEEK[5]]])
  })
})

const LEAVE_PARTIAL = { leave_id: 5, leave_type_label: '事假', status: 'approved' as const, is_full_day: false, start_time: '13:00', end_time: '17:00' }

describe('ShiftGrid 手機預設日與當日標記', () => {
  it('手機：今天在本週時預設選今天；換週後落在新週', async () => {
    const g = grid({ cells: cellsFor() })
    const wrapper = mount(ShiftGrid, {
      props: {
        mode: 'reconcile',
        groups: g.groups,
        employees: g.employees,
        days: visibleDays(g.days, g.cells),
        cells: indexCells(g.cells),
        today: WEEK[3],
        filter: 'all',
        canEditPlan: true,
        shiftOptions: SHIFTS,
        weeklyValue: () => null,
        mobile: true,
      },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find(`[data-test="mobile-day-${WEEK[3]}"]`).attributes('aria-selected')).toBe('true')

    const nextWeek = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysISO(WEEK[0], 7 + i))
    const g2 = grid({
      days: nextWeek.map((d) => day(d)),
      cells: [1, 2, 3].flatMap((id) => nextWeek.map((d) => cell(id, d))),
    })
    await wrapper.setProps({
      days: visibleDays(g2.days, g2.cells),
      cells: indexCells(g2.cells),
    })
    expect(wrapper.find(`[data-test="mobile-day-${nextWeek[0]}"]`).attributes('aria-selected')).toBe('true')
  })

  it('手機（排班）：卡片顯示請假標籤，選定日標出假日、未匯入與空班', async () => {
    const coverage = [{
      date: WEEK[3],
      leaves: [],
      gaps: [{ shiftTypeId: 1, shiftTypeName: '早車', workStart: '07:00', workEnd: '16:30', scheduledCount: 1, absentNames: ['林班導'], severity: 'empty' }],
    }]
    // WEEK[3] 設為假日且未匯入（早於 today），選取該日後檢查標記區
    const g = grid({ cells: cellsFor({ [`2|${WEEK[3]}`]: { leaves: [LEAVE_PARTIAL] } }) })
    const days = g.days.map((d) => (d.date === WEEK[3] ? day(WEEK[3], { is_holiday: true, holiday_name: '補假示例', import_covered: false }) : d))
    const w2 = mount(ShiftGrid, {
      props: {
        mode: 'plan',
        groups: g.groups,
        employees: g.employees,
        days,
        cells: indexCells(g.cells),
        today: WEEK[4],
        filter: 'all',
        canEditPlan: false,
        shiftOptions: SHIFTS,
        weeklyValue: () => null,
        coverage: coverage as never,
        mobile: true,
      },
      global: { plugins: [ElementPlus] },
    })
    await w2.find(`[data-test="mobile-day-${WEEK[3]}"]`).trigger('click')
    expect(w2.find('[data-test="card-2"]').text()).toContain('事假')
    const marks = w2.find('[data-test="mobile-day-marks"]')
    expect(marks.exists()).toBe(true)
    expect(marks.text()).toContain('補假示例')
    expect(marks.find(`[data-test="mobile-not-imported-${WEEK[3]}"]`).exists()).toBe(true)
    expect(marks.find(`[data-test="mobile-gap-${WEEK[3]}"]`).text()).toBe('早車無人上班')
  })
})

describe('ShiftGrid 全天假與無障礙標籤', () => {
  it('全天已核准假：格子帶 full_leave 樣式，判定文字是假別', () => {
    const wrapper = mountGrid({
      cells: cellsFor({
        [`1|${WEEK[1]}`]: {
          actual: {},
          leaves: [{ leave_id: 7, leave_type_label: '病假', status: 'approved', is_full_day: true, start_time: '07:00', end_time: '16:30' }],
        },
      }),
    })
    const el = wrapper.find(`[data-test="cell-1-${WEEK[1]}"]`)
    expect(el.classes()).toContain('shift-grid__cell--full_leave')
    expect(el.find('.shift-grid__verdict').text()).toBe('病假')
  })

  it('格子 aria-label 含來源、請假、老師確認與已封存', () => {
    const wrapper = mountGrid({
      cells: cellsFor({
        [`1|${WEEK[1]}`]: {
          leaves: [LEAVE_PARTIAL],
          confirmation: { item_id: 9, round_id: 2, kind: 'swap', status: 'pending', partner_employee_id: 2 },
          edit: { locked_reason: 'finalized' },
        },
      }),
    })
    const label = wrapper.find(`[data-test="cell-1-${WEEK[1]}"]`).attributes('aria-label') ?? ''
    expect(label).toContain(SOURCE_TAGS.weekly.label)
    expect(label).toContain('事假')
    expect(label).toContain('老師確認：待回覆')
    expect(label).toContain('已封存')
  })

  it('停用班別：格子標已停用；下拉只列在用班別與目前已選的停用班別（停用者不可選）', () => {
    const cells = cellsFor({ [`1|${WEEK[0]}`]: { plan: { source: 'daily', shift_type_id: 3, name: '舊班別', work_start: '07:30', work_end: '16:00' } } })
    const g = grid({ employees: [employee(1, '林班導'), employee(2, '王副導', { role_label: '副班導' })], cells })
    const wrapper = mount(ShiftGrid, {
      props: {
        mode: 'plan',
        groups: g.groups,
        employees: g.employees,
        days: visibleDays(g.days, g.cells),
        cells: indexCells(g.cells),
        today: TODAY,
        filter: 'all',
        canEditPlan: true,
        shiftOptions: SHIFTS,
        weeklyValue: (id: number) => (id === 1 ? 3 : null),
        mobile: false,
      },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).text()).toContain('已停用')
    expect(wrapper.find(`[data-test="cell-2-${WEEK[0]}"]`).text()).not.toContain('已停用')
    const options = wrapper.findAllComponents({ name: 'ElOption' }).map((o) => [o.props('label'), o.props('disabled')])
    expect(options).toContainEqual(['舊班別 07:30–16:00（已停用）', true])
    // 停用班別只出現在目前已選它的那位員工下拉（王副導不列）
    expect(options.filter(([label]) => String(label).startsWith('舊班別'))).toHaveLength(1)
    expect(options.filter(([label]) => String(label).startsWith('早車'))).toHaveLength(2)
  })
})

describe('ShiftGrid 第五輪審查', () => {
  const LATE = { status: 'anomaly' as const, late_minutes: 57, early_leave_minutes: 342, punch_in: `${WEEK[0]}T08:57:00`, punch_out: `${WEEK[0]}T11:18:00` }

  it('符合整月型態的格子是「設定問題」：k-setting（不是扣款色），報讀寫出可能是設定問題；同列其他異常照舊是會扣款', () => {
    const cells = cellsFor({ [`1|${WEEK[0]}`]: { actual: LATE }, [`1|${WEEK[1]}`]: { actual: { ...LATE, punch_in: `${WEEK[1]}T08:57:00`, punch_out: `${WEEK[1]}T11:18:00` } } })
    const wrapper = mountGrid({ cells, patternKeys: new Set([`1|${WEEK[0]}`]) })
    const pattern = wrapper.get(`[data-test="cell-1-${WEEK[0]}"]`)
    expect(pattern.classes()).toContain('shift-grid__cell--k-setting')
    expect(pattern.classes().filter((c) => /--(danger|warning|k-deduct)$/.test(c))).toEqual([])
    expect(pattern.attributes('aria-label')).toContain('整月同型態，可能是設定問題')
    expect(pattern.find('.verdict-shape--setting').exists()).toBe(true)
    const daily = wrapper.get(`[data-test="cell-1-${WEEK[1]}"]`)
    expect(daily.classes()).toContain('shift-grid__cell--k-deduct')
    expect(daily.find('.verdict-shape--deduct').exists()).toBe(true)
  })

  it('封存格：仍顯示判定文字與形狀，class 帶 sealed（CSS 把字與形狀改中性灰）；未封存格沒有', () => {
    const cells = cellsFor({
      [`1|${WEEK[0]}`]: { actual: LATE, edit: { locked_reason: 'finalized' } },
      [`1|${WEEK[1]}`]: { actual: { ...LATE, punch_in: `${WEEK[1]}T08:57:00`, punch_out: `${WEEK[1]}T11:18:00` } },
    })
    const wrapper = mountGrid({ cells })
    const sealed = wrapper.get(`[data-test="cell-1-${WEEK[0]}"]`)
    expect(sealed.classes()).toContain('shift-grid__cell--sealed')
    // LATE 的分鐘數和 07:00 班別時段對不上，判定文字退回「出勤異常」（既有行為）；封存不會把判定藏起來
    expect(sealed.text()).toContain('出勤異常')
    expect(sealed.find('.verdict-shape--deduct').exists()).toBe(true)
    expect(wrapper.get(`[data-test="cell-1-${WEEK[1]}"]`).classes()).not.toContain('shift-grid__cell--sealed')
  })

  it('狀態形狀依 verdictKind：缺卡＝missing、疑似換班＝confirm、資料待補＝pending_data；已豁免與符合原班表不畫形狀', () => {
    const cells = cellsFor({
      [`1|${WEEK[0]}`]: { actual: { status: 'missing_punch', punch_in: `${WEEK[0]}T07:00:00` } },
      [`1|${WEEK[1]}`]: { actual: { status: 'possible_shift_change' } },
      [`1|${WEEK[2]}`]: { actual: { status: 'data_incomplete', punch_in: `${WEEK[2]}T07:00:00` } },
      [`2|${WEEK[0]}`]: { actual: { ...LATE, confirmed_action: 'admin_waive' } },
      [`2|${WEEK[1]}`]: { actual: { status: 'matched' } },
    })
    const wrapper = mountGrid({ cells })
    const at = (emp: number, date: string) => wrapper.get(`[data-test="cell-${emp}-${date}"]`)
    expect(at(1, WEEK[0]).classes()).toContain('shift-grid__cell--k-missing')
    expect(at(1, WEEK[0]).find('.verdict-shape--missing').exists()).toBe(true)
    expect(at(1, WEEK[1]).classes()).toContain('shift-grid__cell--k-confirm')
    expect(at(1, WEEK[1]).find('.verdict-shape--confirm').exists()).toBe(true)
    expect(at(1, WEEK[2]).classes()).toContain('shift-grid__cell--k-pending_data')
    expect(at(1, WEEK[2]).find('.verdict-shape--pending_data').exists()).toBe(true)
    for (const waivedOrMatched of [at(2, WEEK[0]), at(2, WEEK[1])]) {
      expect(waivedOrMatched.classes().some((c) => c.includes('--k-'))).toBe(false)
      expect(waivedOrMatched.find('.verdict-shape').exists()).toBe(false)
    }
  })

  it('老師確認進行中：格子是 k-confirm，確認提示前面畫菱形；符合原班表的判定文字不跟著變色', () => {
    const cells = cellsFor({
      [`1|${WEEK[0]}`]: { actual: {}, confirmation: { item_id: 1, round_id: 1, kind: 'swap', status: 'pending', partner_employee_id: 2 } },
    })
    const wrapper = mountGrid({ cells })
    const confirming = wrapper.get(`[data-test="cell-1-${WEEK[0]}"]`)
    expect(confirming.classes()).toContain('shift-grid__cell--k-confirm')
    expect(confirming.get('.shift-grid__confirm').find('.verdict-shape--confirm').exists()).toBe(true)
    expect(confirming.get('.shift-grid__verdict').find('.verdict-shape').exists()).toBe(false)
    expect(confirming.get('.shift-grid__verdict').classes()).not.toContain('shift-grid__verdict--flag')
  })

  it('列首型態註記是按鈕：點了開本月設定檢查，報讀含型態說明', async () => {
    const wrapper = mountGrid({ personNotes: { 2: { tag: '時段可能設錯', detail: '20 天中 18 天遲到' } } })
    const note = wrapper.get('[data-test="person-note-2"]')
    expect(note.element.tagName).toBe('BUTTON')
    expect(note.attributes('aria-label')).toContain('20 天中 18 天遲到')
    await note.trigger('click')
    expect(wrapper.emitted('show-patterns')).toHaveLength(1)
  })

  it('非應出勤日只畫一槓（收窄的週末欄不折行），報讀仍念全文', () => {
    const wrapper = mountGrid({ showAllDays: true })
    const sat = wrapper.get(`[data-test="cell-1-${WEEK[5]}"]`)
    expect(sat.text()).toBe('—')
    expect(sat.attributes('aria-label')).toContain('非應出勤日')
  })

  it('只看待處理：同一列裡不是待處理的格子退到背景', () => {
    const cells = cellsFor({ [`1|${WEEK[0]}`]: { actual: LATE }, [`1|${WEEK[1]}`]: { actual: { status: 'matched' } } })
    const wrapper = mountGrid({ cells, filter: 'issues' })
    expect(wrapper.get(`[data-test="cell-1-${WEEK[0]}"]`).classes()).not.toContain('shift-grid__cell--quiet')
    expect(wrapper.get(`[data-test="cell-1-${WEEK[1]}"]`).classes()).toContain('shift-grid__cell--quiet')
    expect(mountGrid({ cells }).get(`[data-test="cell-1-${WEEK[1]}"]`).classes()).not.toContain('shift-grid__cell--quiet')
  })

  it('方向鍵在格子間移動焦點（上下跨人、左右跨日）', async () => {
    const wrapper = mountGrid({ attach: true })
    const first = wrapper.get(`[data-test="cell-1-${WEEK[0]}"]`)
    ;(first.element as HTMLElement).focus()
    await first.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(wrapper.get(`[data-test="cell-1-${WEEK[1]}"]`).element)
    await wrapper.get(`[data-test="cell-1-${WEEK[1]}"]`).trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(wrapper.get(`[data-test="cell-2-${WEEK[1]}"]`).element)
    await wrapper.get(`[data-test="cell-2-${WEEK[1]}"]`).trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(wrapper.get(`[data-test="cell-2-${WEEK[0]}"]`).element)
    // 到邊界不動
    await wrapper.get(`[data-test="cell-2-${WEEK[0]}"]`).trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(wrapper.get(`[data-test="cell-2-${WEEK[0]}"]`).element)
    wrapper.unmount()
  })

  it('欄寬下限合計留餘裕塞進 1280 寬的內容區（約 924px）：週六有人上班時那欄會被內容撐到約 106px', () => {
    const css = readFileSync(resolve(__dirname, '../ShiftGrid.vue'), 'utf8')
    const px = (re: RegExp) => Number(css.match(re)![1])
    const person = px(/\.shift-grid__person \{[^}]*min-width: (\d+)px/)
    const weekday = px(/\.shift-grid__day \{ min-width: (\d+)px/)
    const weekend = px(/\.shift-grid__day--off \{ min-width: (\d+)px/)
    // 一個週末欄被內容撐到 106px 時仍要放得下
    expect(person + weekday * 5 + weekend + 106).toBeLessThanOrEqual(924)
  })
})

describe('ShiftGrid 核對／排班兩種模式', () => {
  const GAP = [{
    date: WEEK[2],
    leaves: [] as never[],
    gaps: [{ shiftTypeId: 1, shiftTypeName: '早車', workStart: '07:00', workEnd: '16:30', scheduledCount: 1, absentNames: ['林班導'], severity: 'empty' }],
  }]
  const ANOMALY = { status: 'anomaly' as const, punch_in: `${WEEK[0]}T08:30:00`, punch_out: `${WEEK[0]}T18:00:00` }
  const PENDING_CONFIRM = { item_id: 9, round_id: 2, kind: 'swap' as const, status: 'pending' as const, partner_employee_id: 2 }

  it('核對：可改計畫也不畫本週班別下拉、未儲存標籤與欄頭空班警示（桌機與手機）', () => {
    const desk = mountGrid({ mode: 'reconcile', canEditPlan: true, changedIds: new Set([1]), coverage: GAP })
    expect(desk.findComponent({ name: 'ElSelect' }).exists()).toBe(false)
    expect(desk.find('[data-test="weekly-1"]').exists()).toBe(false)
    expect(desk.find('[data-test="unsaved-1"]').exists()).toBe(false)
    expect(desk.find(`[data-test="gap-${WEEK[2]}"]`).exists()).toBe(false)
    const phone = mountGrid({ mode: 'reconcile', mobile: true, canEditPlan: true, changedIds: new Set([1]), coverage: GAP })
    expect(phone.find('[data-test="weekly-1"]').exists()).toBe(false)
    expect(phone.find('[data-test="unsaved-1"]').exists()).toBe(false)
    expect(phone.find('[data-test="mobile-day-marks"]').text()).not.toContain('無人上班')
  })

  it('排班：有下拉、未儲存標籤與空班警示', () => {
    const wrapper = mountGrid({ mode: 'plan', changedIds: new Set([1]), coverage: GAP })
    expect(wrapper.find('[data-test="weekly-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="unsaved-1"]').exists()).toBe(true)
    expect(wrapper.find(`[data-test="gap-${WEEK[2]}"]`).text()).toBe('早車無人上班')
  })

  it('排班：格子只有計畫行與假別，不畫打卡、判定、老師確認與狀態形狀', () => {
    const cells = cellsFor({
      [`1|${WEEK[0]}`]: { actual: ANOMALY, leaves: [LEAVE_PARTIAL], confirmation: PENDING_CONFIRM },
      [`1|${WEEK[1]}`]: { actual: {}, leaves: [{ leave_id: 7, leave_type_label: '病假', status: 'approved', is_full_day: true, start_time: '07:00', end_time: '16:30' }] },
    })
    const plan = mountGrid({ mode: 'plan', cells, personNotes: { 1: { tag: '本月沒有打卡', detail: '本月都沒有打卡' } } })
    const busy = plan.get(`[data-test="cell-1-${WEEK[0]}"]`)
    expect(busy.text()).toContain('週 早車 07:00–16:30')
    expect(busy.text()).toContain('事假')
    for (const text of ['08:30–18:00', '出勤異常', '老師確認']) expect(busy.text()).not.toContain(text)
    expect(busy.find('.shift-grid__verdict').exists()).toBe(false)
    expect(busy.find('.verdict-shape').exists()).toBe(false)
    expect(busy.classes().filter((c) => c.startsWith('shift-grid__cell--k-'))).toEqual([])
    expect(busy.attributes('aria-label')).not.toContain('出勤異常')
    // 全天假：判定行不見了，假別仍要看得到
    expect(plan.get(`[data-test="cell-1-${WEEK[1]}"]`).text()).toContain('病假')
    // 本月型態是核對的事，排班不放
    expect(plan.find('[data-test="person-note-1"]').exists()).toBe(false)
    // 同一格在核對照舊有打卡與判定
    const reconcile = mountGrid({ mode: 'reconcile', cells }).get(`[data-test="cell-1-${WEEK[0]}"]`)
    expect(reconcile.text()).toContain('08:30–18:00')
    expect(reconcile.text()).toContain('出勤異常')
  })

  it('排班手機卡片：只有計畫與假別', async () => {
    const cells = cellsFor({ [`2|${WEEK[0]}`]: { actual: ANOMALY, leaves: [LEAVE_PARTIAL] } })
    const wrapper = mountGrid({ mode: 'plan', mobile: true, cells })
    await wrapper.find(`[data-test="mobile-day-${WEEK[0]}"]`).trigger('click')
    const card = wrapper.get('[data-test="card-2"]')
    expect(card.text()).toContain('事假')
    expect(card.text()).not.toContain('08:30–18:00')
    expect(card.text()).not.toContain('出勤異常')
  })
})

// ── 第六輪：手機預設日與日期列固定（任務 9）──────────────────────────────
// 2026-10-24 是週六（今天）；本週一到日＝10/19–10/25
const OCT = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysISO('2026-10-19', i))
const OCT_TODAY = '2026-10-24'
const OCT_ANOMALY = { status: 'anomaly' as const }

function octCells(overrides: Record<string, Parameters<typeof cell>[2]> = {}, dates: string[] = OCT): GridCell[] {
  return [1, 2, 3].flatMap((id) =>
    dates.map((date) => cell(id, date, overrides[`${id}|${date}`] ?? { plan: { expected: day(date).is_workday } })),
  )
}

function mountOct(opts: Parameters<typeof mountGrid>[0] & { overrides?: Record<string, Parameters<typeof cell>[2]> } = {}) {
  const { overrides, ...rest } = opts
  return mountGrid({ mobile: true, today: OCT_TODAY, days: OCT.map((d) => day(d)), cells: octCells(overrides), ...rest })
}

const selectedDay = (wrapper: ReturnType<typeof mountGrid>): string | undefined =>
  wrapper.findAll('[role="tab"]').find((tab) => tab.attributes('aria-selected') === 'true')?.attributes('data-test')?.replace('mobile-day-', '')

describe('ShiftGrid 手機預設選取日（第六輪）', () => {
  const scrolled: Array<{ el: HTMLElement; arg: unknown }> = []
  beforeEach(() => {
    scrolled.length = 0
    // happy-dom 沒有 scrollIntoView
    Element.prototype.scrollIntoView = vi.fn(function (this: HTMLElement, arg?: unknown) { scrolled.push({ el: this, arg }) }) as never
  })
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('今天是週六、週四有待辦：選週四（≤ 今天且有待辦的最晚一天，不選更早的週二）', () => {
    const wrapper = mountOct({ overrides: { [`2|${OCT[1]}`]: { actual: OCT_ANOMALY }, [`2|${OCT[3]}`]: { actual: OCT_ANOMALY } } })
    expect(selectedDay(wrapper)).toBe(OCT[3])
  })

  it('沒有待辦：選 ≤ 今天的最晚工作日（週五），不選週六那種非工作日', () => {
    expect(selectedDay(mountOct())).toBe(OCT[4])
    expect(selectedDay(mountOct({ showAllDays: true }))).toBe(OCT[4])
  })

  it('封存格不算待辦（點進去只會 409）：週四只有封存遺留時，預設選週五', () => {
    const wrapper = mountOct({ overrides: { [`2|${OCT[3]}`]: { actual: OCT_ANOMALY, edit: { locked_reason: 'finalized' } } } })
    expect(selectedDay(wrapper)).toBe(OCT[4])
  })

  it('不選今天以後的日子：今天是週三，只有週五有進行中的老師確認時選週三', () => {
    const confirmation = { item_id: 9, round_id: 2, kind: 'swap' as const, status: 'pending' as const, partner_employee_id: 2 }
    const wrapper = mountOct({ today: OCT[2], overrides: { [`1|${OCT[4]}`]: { actual: {}, confirmation } } })
    expect(selectedDay(wrapper)).toBe(OCT[2])
  })

  it('今天以前的工作日都沒有（整週在未來）：選本週第一個工作日', () => {
    const wrapper = mountOct({ today: addDaysISO(OCT[0], -3) })
    expect(selectedDay(wrapper)).toBe(OCT[0])
  })

  it('有待辦的判斷跟著篩選走：封存時未處理＝只認封存遺留；有待辦＝逐日待辦；型態格（設定問題）不算有待辦', () => {
    // 王：週三封存時沒處理、週四逐日待辦（同一個人，兩種遺留並存）
    const overrides = {
      [`2|${OCT[2]}`]: { actual: OCT_ANOMALY, edit: { locked_reason: 'finalized' as const } },
      [`2|${OCT[3]}`]: { actual: OCT_ANOMALY },
    }
    expect(selectedDay(mountOct({ overrides, filter: 'leftover' }))).toBe(OCT[2])
    expect(selectedDay(mountOct({ overrides, filter: 'issues' }))).toBe(OCT[3])
    // 週四那格是整月同型態（設定問題）→「有待辦」篩選下它退背景，不算被突出的格子，改選週二的逐日待辦
    const withPattern = { [`2|${OCT[1]}`]: { actual: OCT_ANOMALY }, [`2|${OCT[3]}`]: { actual: OCT_ANOMALY } }
    const patternKeys = new Set([`2|${OCT[3]}`])
    expect(selectedDay(mountOct({ overrides: withPattern, filter: 'issues', patternKeys, patternEmployeeIds: new Set([2]) }))).toBe(OCT[1])
    // 設定問題篩選：反過來只認型態格
    expect(selectedDay(mountOct({ overrides: withPattern, filter: 'patterns', patternKeys, patternEmployeeIds: new Set([2]) }))).toBe(OCT[3])
  })

  it('排班模式不看判定（格子裡沒有待辦可看）：不會因為看不到的異常跳走，選 ≤ 今天的最晚工作日', () => {
    const wrapper = mountOct({ mode: 'plan', overrides: { [`2|${OCT[1]}`]: { actual: OCT_ANOMALY } } })
    expect(selectedDay(wrapper)).toBe(OCT[4])
  })

  it('換週時重算（有待辦的那天／沒有就最晚工作日／整週在未來就第一個工作日）；同一週重抓資料不動使用者選的日子', async () => {
    const wrapper = mountOct({ overrides: { [`2|${OCT[3]}`]: { actual: OCT_ANOMALY } } })
    expect(selectedDay(wrapper)).toBe(OCT[3])

    const rangeProps = (dates: string[], overrides: Record<string, Parameters<typeof cell>[2]> = {}) => {
      const g = grid({ days: dates.map((d) => day(d)), employees: [employee(1, '林班導'), employee(2, '王副導', { role_label: '副班導' }), employee(3, '李廚工', { group_key: 'other', role_label: '廚工' })], cells: octCells(overrides, dates) })
      return { days: visibleDays(g.days, g.cells), cells: indexCells(g.cells) }
    }
    // 上一週：週三有待辦 → 週三
    const prevWeek = OCT.map((d) => addDaysISO(d, -7))
    await wrapper.setProps(rangeProps(prevWeek, { [`1|${prevWeek[2]}`]: { actual: OCT_ANOMALY } }))
    expect(selectedDay(wrapper)).toBe(prevWeek[2])
    // 下一週：全在今天之後 → 第一個工作日
    const nextWeek = OCT.map((d) => addDaysISO(d, 7))
    await wrapper.setProps(rangeProps(nextWeek))
    expect(selectedDay(wrapper)).toBe(nextWeek[0])

    // 同一週重抓（處理完一件後資料重載）：使用者手動選的日子保留
    await wrapper.setProps(rangeProps(OCT, { [`2|${OCT[3]}`]: { actual: OCT_ANOMALY } }))
    expect(selectedDay(wrapper)).toBe(OCT[3])
    await wrapper.get(`[data-test="mobile-day-${OCT[1]}"]`).trigger('click')
    await wrapper.setProps(rangeProps(OCT))
    expect(selectedDay(wrapper)).toBe(OCT[1])
  })

  it('選取的日期 chip 在掛載與改變時捲到橫向置中（block nearest 不拉動頁面垂直捲動）', async () => {
    const wrapper = mountOct({ attach: true })
    const chip = (date: string) => wrapper.get(`[data-test="mobile-day-${date}"]`).element
    expect(scrolled.map((s) => s.el)).toEqual([chip(OCT[4])])
    expect(scrolled[0].arg).toEqual({ inline: 'center', block: 'nearest' })

    await wrapper.get(`[data-test="mobile-day-${OCT[1]}"]`).trigger('click')
    expect(scrolled.map((s) => s.el)).toEqual([chip(OCT[4]), chip(OCT[1])])
    expect(scrolled[1].arg).toEqual({ inline: 'center', block: 'nearest' })
    wrapper.unmount()
  })

  it('日期列在手機寬度（--to-sm）固定在捲動區頂端，且有不透明背景（卡片從底下捲過去不透字）', () => {
    const css = readFileSync(resolve(__dirname, '../ShiftGrid.vue'), 'utf8')
    const mobileBlock = css.match(/@media \(--to-sm\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const rule = mobileBlock.match(/\.shift-grid__day-picker \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('position: sticky')
    expect(rule).toContain('top: 0')
    expect(rule).toMatch(/background: var\(--bg-color\)/)
  })
})

describe('ShiftGrid 欄頭假日名（第六輪）', () => {
  const NAME = '中華民國開國紀念日補假'
  const holidayDays = () => WEEK.map((d) => (d === WEEK[1] ? day(d, { is_holiday: true, holiday_name: NAME }) : day(d)))

  it('假日 tag 的 title 是完整名稱（欄窄時 tag 內文會省略）', () => {
    const wrapper = mountGrid({ days: holidayDays() })
    const holiday = wrapper.get(`[data-test="day-${WEEK[1]}"] .shift-grid__holiday`)
    expect(holiday.get('.el-tag').text()).toBe(NAME)
    expect(holiday.attributes('title')).toBe(NAME)
  })

  it('沒有假日名時 tag 寫「假日」，title 也是「假日」', () => {
    const wrapper = mountGrid({ days: WEEK.map((d) => (d === WEEK[1] ? day(d, { is_holiday: true }) : day(d))) })
    const holiday = wrapper.get(`[data-test="day-${WEEK[1]}"] .shift-grid__holiday`)
    expect([holiday.get('.el-tag').text(), holiday.attributes('title')]).toEqual(['假日', '假日'])
  })

  it('假日 tag 不撐寬欄：外層不計入欄的內容寬（width 0、min-width 100%），tag 最寬到欄寬並以省略號收尾', () => {
    const css = readFileSync(resolve(__dirname, '../ShiftGrid.vue'), 'utf8')
    const rule = (selector: string) => css.match(new RegExp(`${selector} \\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule('\\.shift-grid__holiday')).toContain('width: 0')
    expect(rule('\\.shift-grid__holiday')).toContain('min-width: 100%')
    expect(rule('\\.shift-grid__holiday \\.el-tag')).toContain('max-width: 100%')
    expect(rule('\\.shift-grid__holiday :deep\\(\\.el-tag__content\\)')).toContain('text-overflow: ellipsis')
  })
})
