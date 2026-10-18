import { describe, it, expect } from 'vitest'
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
    },
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
    expect(wrapper.find(`[data-test="cell-2-${WEEK[0]}"]`).classes()).toContain('shift-grid__cell--danger')
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
    expect(css).toMatch(/\.shift-grid__cell--danger \.shift-grid__verdict \{[^}]*color: var\(--color-danger-darker\)/)
    expect(css).toMatch(/\.shift-grid__cell--warning \.shift-grid__verdict \{[^}]*color: var\(--color-warning-darker\)/)
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

  it('本週班別下拉只在可改計畫時出現，改值送出 weekly-change', async () => {
    const wrapper = mountGrid()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(wrapper.find('[data-test="weekly-1"]').exists()).toBe(true)
    select.vm.$emit('update:modelValue', 2)
    expect(wrapper.emitted('weekly-change')).toEqual([[1, 2]])
    select.vm.$emit('update:modelValue', undefined)
    expect(wrapper.emitted('weekly-change')?.[1]).toEqual([1, null])
    expect(mountGrid({ canEditPlan: false }).find('[data-test="weekly-1"]').exists()).toBe(false)
  })

  it('欄頭顯示空班警示', () => {
    const wrapper = mountGrid({
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
    const cells = cellsFor({ [`1|${WEEK[0]}`]: { actual: { status: 'anomaly', punch_in: `${WEEK[0]}T07:57:00`, punch_out: `${WEEK[0]}T11:48:00`, late_minutes: 57, early_leave_minutes: 342 } } })
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

  it('手機：卡片顯示請假標籤，選定日標出假日、未匯入與空班', async () => {
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
