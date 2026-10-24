import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { effectScope, ref } from 'vue'
import ElementPlus, { ElDrawer } from 'element-plus'
import { useMonthGrid } from '@/composables/useMonthGrid'
import MonthProgressBar from '../MonthProgressBar.vue'
import AttendancePatternList from '../AttendancePatternList.vue'
import { cell, day, employee, grid, WEEK } from './gridFixtures'

const api = vi.hoisted(() => ({ grid: vi.fn(), rounds: vi.fn(), round: vi.fn(), unrounded: vi.fn() }))
const perms = vi.hoisted(() => ({ set: new Set(['SCHEDULE', 'ATTENDANCE_READ', 'SALARY_READ']) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/attendanceConfirmation', () => ({ listConfirmationRounds: api.rounds, getConfirmationRound: api.round, listUnroundedConfirmationItems: api.unrounded }))
vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => perms.set.has(code) }))

function monthGrid() {
  return grid({
    today: '2026-09-21',
    days: WEEK.map((d, i) => day(d, { import_covered: i < 3 })),
    cells: [
      cell(1, WEEK[0], { plan: { source: 'default' } }),
      cell(1, WEEK[1], { plan: { source: 'employee' } }),
      cell(1, WEEK[5], { plan: { source: 'default', expected: false } }), // 週六不算
      cell(2, WEEK[0], { actual: { status: 'anomaly' } }),
      cell(2, WEEK[1], { actual: { status: 'matched' } }),
    ],
  })
}

const anchor = ref('2026-09-16')
const revision = ref(0)
// anchor／revision 是跨案例共用的 ref：每個案例建的 useMonthGrid 要在 afterEach 停掉，否則舊案例的 watcher 會跟著重抓
const scopes: ReturnType<typeof effectScope>[] = []
function mountBar(options: { stubTeleport?: boolean; mobile?: boolean } = {}) {
  const scope = effectScope()
  scopes.push(scope)
  const month = scope.run(() => useMonthGrid(anchor, revision))!
  return mount(MonthProgressBar, {
    props: { month, mobile: options.mobile },
    global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub, ...(options.stubTeleport === false ? {} : { teleport: true }) } },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  // 「這個月是不是早於今天所在月份」用台北今天：固定在台北 2026-10-24 中午
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T04:00:00Z'))
  perms.set = new Set(['SCHEDULE', 'ATTENDANCE_READ', 'SALARY_READ'])
  anchor.value = '2026-09-16'
  revision.value = 0
  // 每次回新物件（同真 API）；否則 revision 重抓時 data 指向同一物件、watch 不觸發
  api.grid.mockImplementation(async () => ({ data: monthGrid() }))
  api.rounds.mockResolvedValue({ data: [] })
  api.unrounded.mockResolvedValue({ data: [] })
})

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
})

// ── 狀態用的整月資料 ──────────────────────────────────────────────────────────
const MATCHED = { status: 'matched' as const }
const ANOMALY = { status: 'anomaly' as const }
const SEALED = { locked_reason: 'finalized' as const, plan: false }

/** 匯入齊、沒有待辦、沒有型態：下一步是老師確認或交薪資 */
function cleanGrid() {
  return grid({
    today: '2026-09-21',
    days: WEEK.map((d) => day(d)),
    cells: [cell(1, WEEK[0], { actual: MATCHED }), cell(2, WEEK[0], { actual: MATCHED })],
  })
}

/** 匯入齊、3 件逐日待辦、沒有型態 */
function dailyGrid() {
  return grid({
    today: '2026-09-21',
    days: WEEK.map((d) => day(d)),
    cells: [cell(1, WEEK[0], { actual: ANOMALY }), cell(2, WEEK[0], { actual: ANOMALY }), cell(2, WEEK[1], { actual: ANOMALY })],
  })
}

/** 匯入齊；員工 1 整月沒有打卡（3 件型態），員工 2 有 1 件逐日待辦 */
function fullPatternGrid() {
  return grid({
    today: '2026-09-21',
    days: WEEK.map((d) => day(d)),
    cells: [
      ...WEEK.slice(0, 3).map((d) => cell(1, d, { actual: { status: 'data_incomplete' } })),
      cell(2, WEEK[0], { actual: ANOMALY }),
    ],
  })
}

/** 兩位在職員工；sealedIds 裡的人整月封存；leftover＝封存者有一件封存前沒處理的異常 */
function sealedGrid(sealedIds: number[], leftover = 0) {
  const sealedCells = (id: number) =>
    WEEK.slice(0, 3).map((d, i) => cell(id, d, { edit: SEALED, actual: i < leftover ? ANOMALY : MATCHED }))
  return grid({
    today: '2026-09-21',
    days: WEEK.map((d) => day(d)),
    cells: [1, 2].flatMap((id) => (sealedIds.includes(id) ? sealedCells(id) : [cell(id, WEEK[0], { actual: MATCHED })])),
  })
}

const useGrid = (build: () => ReturnType<typeof grid>) => api.grid.mockImplementation(async () => ({ data: build() }))
const text = (wrapper: ReturnType<typeof mountBar>, sel: string) => wrapper.get(sel).text()

describe('MonthProgressBar 步驟列', () => {
  it('open：五步依序、目前步驟 aria-current="step"，文字照月摘要', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-30' })
    const list = wrapper.get('ol')
    expect(list.attributes('aria-label')).toBe('9 月結算進度')
    expect(list.findAll('li').map((li) => li.get('.month-progress__name').text())).toEqual(['打卡匯入', '先修設定', '逐日待辦', '老師確認換班', '交薪資'])
    // 9/17、9/18 到昨天為止還沒匯入 → 目前這步是匯入；排班那一步（預設工時）已不在進度列
    expect(text(wrapper, '[data-test="progress-import"]')).toContain('缺 2 個工作日')
    expect(text(wrapper, '[data-test="progress-patterns"]')).toContain('沒有')
    expect(text(wrapper, '[data-test="progress-issues"]')).toContain('1 件')
    expect(text(wrapper, '[data-test="progress-rounds-status"]')).toBe('沒有進行中')
    expect(text(wrapper, '[data-test="progress-salary"]')).toContain('前面完成後開放')
    expect(wrapper.find('[data-test="progress-schedule"]').exists()).toBe(false)
    const current = wrapper.findAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0].text()).toContain('打卡匯入')
    expect(wrapper.find('[data-test="progress-sealed"]').exists()).toBe(false)
  })

  it('點擊：打卡匯入→import、逐日待辦→show-issues、交薪資連往 /salary/settle', async () => {
    const wrapper = mountBar()
    await flushPromises()
    await wrapper.get('[data-test="progress-import"]').trigger('click')
    expect(wrapper.emitted('import')).toHaveLength(1)
    await wrapper.get('[data-test="progress-issues"]').trigger('click')
    expect(wrapper.emitted('show-issues')).toHaveLength(1)
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/salary/settle')
  })

  it('summary 事件送出整份月摘要與目前步驟（頁首、匯出提醒共用）', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.emitted('summary')!.at(-1)![0]).toMatchObject({
      year: 2026,
      month: 9,
      step: 'import',
      sealState: 'open',
      employedCount: 2,
      patternPeople: 0,
      patternIssueCount: 0,
      dailyIssueCount: 1,
      leftoverCount: 0,
      importStatus: { lastCovered: '2026-09-16', missingWorkdays: ['2026-09-17', '2026-09-18'] },
    })
  })

  it('目前這步隨資料往下走：設定問題 → 逐日待辦 → 老師確認 → 交薪資', async () => {
    useGrid(fullPatternGrid)
    const patterns = mountBar()
    await flushPromises()
    expect(patterns.get('[aria-current="step"]').text()).toContain('先修設定')
    expect(patterns.emitted('summary')!.at(-1)![0]).toMatchObject({ step: 'patterns' })

    useGrid(dailyGrid)
    const daily = mountBar()
    await flushPromises()
    expect(daily.get('[aria-current="step"]').text()).toContain('逐日待辦')

    api.rounds.mockResolvedValue({ data: [ROUND] })
    api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 0), progressEmp(2, 1), progressEmp(3, 0)] } })
    useGrid(cleanGrid)
    const confirm = mountBar()
    await flushPromises()
    expect(confirm.get('[aria-current="step"]').text()).toContain('老師確認換班')
    // 還有 1 人沒回覆：summary 的 step 也在老師回覆載入後更新成 confirm
    expect(confirm.emitted('summary')!.at(-1)![0]).toMatchObject({ step: 'confirm' })

    api.rounds.mockResolvedValue({ data: [] })
    const payroll = mountBar()
    await flushPromises()
    expect(payroll.get('[aria-current="step"]').text()).toContain('交薪資')
    expect(text(payroll, '[data-test="progress-salary"]')).toContain('可以交了')
  })

  it('各步驟文字：已匯入至／還沒匯入、人數與可清掉件數、沒有', async () => {
    useGrid(cleanGrid)
    const clean = mountBar()
    await flushPromises()
    expect(text(clean, '[data-test="progress-import"]')).toContain('已匯入至 9/20')
    expect(text(clean, '[data-test="progress-patterns"]')).toContain('沒有')
    expect(text(clean, '[data-test="progress-issues"]')).toContain('沒有')

    useGrid(fullPatternGrid)
    const patterns = mountBar()
    await flushPromises()
    expect(text(patterns, '[data-test="progress-patterns"]')).toContain('1 人，修好可清掉 3 件')
    expect(text(patterns, '[data-test="progress-issues"]')).toContain('1 件')

    useGrid(() =>
      grid({ today: '2026-09-21', days: WEEK.map((d) => day(d, { import_covered: false })), cells: [cell(1, WEEK[0], { actual: { status: 'data_incomplete', punch_in: null, punch_out: null } })] }),
    )
    const none = mountBar()
    await flushPromises()
    expect(text(none, '[data-test="progress-import"]')).toContain('還沒匯入')
  })

  it('整天未匯入的「資料待補」不算待辦；已匯入至之前的缺口算缺的工作日', async () => {
    const NONE = { status: 'data_incomplete' as const, punch_in: null, punch_out: null }
    useGrid(() =>
      grid({
        today: '2026-09-21',
        days: WEEK.map((d, i) => day(d, { import_covered: i !== 1 })), // 9/15 整天沒匯入
        cells: [cell(1, WEEK[1], { actual: NONE }), cell(2, WEEK[0], { actual: NONE })],
      }),
    )
    const wrapper = mountBar()
    await flushPromises()
    expect(text(wrapper, '[data-test="progress-import"]')).toContain('缺 1 個工作日')
    expect(text(wrapper, '[data-test="progress-issues"]')).toContain('1 件') // 只算 9/14 那格
  })

  it('一天都還沒匯入：設定問題與逐日待辦不寫「沒有」（會被讀成都處理完了），改寫等匯入', async () => {
    useGrid(() =>
      grid({
        today: '2026-09-21',
        days: WEEK.map((d) => day(d, { import_covered: false })),
        cells: [cell(1, WEEK[0], { actual: { status: 'data_incomplete', punch_in: null, punch_out: null } })],
      }),
    )
    const wrapper = mountBar()
    await flushPromises()
    for (const sel of ['progress-patterns', 'progress-issues']) {
      expect(text(wrapper, `[data-test="${sel}"]`)).toContain('等匯入後才能核對')
      expect(text(wrapper, `[data-test="${sel}"]`)).not.toContain('沒有')
    }
    expect(wrapper.get('[aria-current="step"]').text()).toContain('打卡匯入')
  })

  it('只有排班與薪資讀取權限：只看得到交薪資一步，且不被「還沒匯入」卡住', async () => {
    perms.set = new Set(['SCHEDULE', 'SALARY_READ'])
    const wrapper = mountBar()
    await flushPromises()
    for (const sel of ['progress-import', 'progress-patterns', 'progress-issues', 'progress-rounds', 'progress-schedule']) {
      expect(wrapper.find(`[data-test="${sel}"]`).exists()).toBe(false)
    }
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.find('[data-test="progress-salary"]').exists()).toBe(true)
    // 沒有出勤讀取權限就沒有匯入涵蓋資料，不能因此判成「還沒匯入」而永遠停在第一步
    expect(wrapper.emitted('summary')!.at(-1)![0]).toMatchObject({ step: 'payroll' })
  })

  it('沒有 SALARY_READ：交薪資只顯示純文字，不是連結（點了會被路由守衛擋下）', async () => {
    perms.set = new Set(['SCHEDULE', 'ATTENDANCE_READ'])
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-salary"]').exists()).toBe(false)
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(wrapper.get('[data-test="progress-salary-text"]').text()).toContain('交薪資')
  })

  it('沒有型態時「先修設定」不能點（沒有東西可開）', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.get('[data-test="progress-patterns"]').attributes('disabled')).toBeDefined()
  })

  it('資料異動（revision）時重新統計', async () => {
    mountBar()
    await flushPromises()
    revision.value = 1
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(2)
  })

  it('同月換日期不重抓，換月才重抓', async () => {
    mountBar()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(1)
    anchor.value = '2026-09-20'
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(1)
    anchor.value = '2026-10-05'
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(2)
    expect(api.grid).toHaveBeenLastCalledWith({ start_date: '2026-10-01', end_date: '2026-10-31' })
  })

  it('載入中顯示「…」；載入失敗：不寫「沒有」或 0 件，提供重試，也不送統計', async () => {
    api.grid.mockImplementationOnce(() => new Promise(() => {}))
    const loading = mountBar()
    await flushPromises()
    expect(text(loading, '[data-test="progress-issues"]')).toContain('…')
    expect(loading.emitted('summary')).toBeUndefined()

    api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
    const wrapper = mountBar()
    await flushPromises()
    const whole = wrapper.text()
    expect(whole).not.toContain('沒有')
    expect(whole).not.toContain('0 件')
    expect(wrapper.get('[data-test="progress-error"]').text()).toContain('伺服器錯誤')
    expect(text(wrapper, '[data-test="progress-issues"]')).toContain('—')
    // 載入失敗不送統計：頁面不能把「沒資料」當成「都處理完」而放行匯出月報
    expect(wrapper.emitted('summary')).toBeUndefined()
    await wrapper.get('[data-test="progress-retry"]').trigger('click')
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(3)
    expect(wrapper.find('[data-test="progress-error"]').exists()).toBe(false)
    expect(text(wrapper, '[data-test="progress-issues"]')).toContain('1 件')
  })

  it('關閉老師確認抽屜時通知頁殼 changed', async () => {
    // 抽屜 teleport 到 body；不用 teleport stub，否則 VTU 找不到 ElDrawer 元件
    const wrapper = mountBar({ stubTeleport: false })
    await flushPromises()
    await wrapper.get('[data-test="progress-rounds"]').trigger('click')
    await flushPromises()
    wrapper.findAllComponents(ElDrawer).find((d) => d.props('title') === '月底出勤確認（老師確認）')!.vm.$emit('closed')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('樣式：目前步驟用淺底強調、不用側邊色條；步驟與連結可點區域在觸控裝置撐到 44px', () => {
    const css = readFileSync(resolve(__dirname, '../MonthProgressBar.vue'), 'utf8')
    expect(css).toMatch(/\.month-progress__step\.is-current \{[^}]*background: var\(--color-primary-lighter\)/)
    expect(css).not.toMatch(/border-left:\s*\d+px solid var\(--color-primary/)
    // 基本規則不設高度（桌機撐高會把格子推出首屏），只有觸控裝置撐到觸控目標最小值
    const base = css.match(/\.month-progress__action \{([^}]*)\}/)![1]
    expect(base).not.toContain('min-height')
    expect(css).toMatch(/@media \(pointer: coarse\)[^@]*\.month-progress__action \{[^}]*min-height: var\(--touch-target-min\)/)
  })
})

describe('MonthProgressBar 封存與部分封存', () => {
  it('sealed：整條換成橫幅，沒有步驟列；有封存時未處理的件就給看清單的按鈕', async () => {
    useGrid(() => sealedGrid([1, 2], 2))
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('ol').exists()).toBe(false)
    const banner = wrapper.get('[data-test="progress-sealed"]')
    expect(banner.text()).toContain('9 月薪資已封存，這個月的出勤只能看、不能改。')
    expect(banner.text()).toContain('封存時還有 4 件沒處理，已照系統規則算進薪資。')
    await wrapper.get('[data-test="progress-show-leftover"]').trigger('click')
    expect(wrapper.emitted('show-leftover')).toHaveLength(1)
    expect(wrapper.get('[data-test="progress-show-leftover"]').text()).toBe('看這 4 件')
    expect(wrapper.emitted('summary')!.at(-1)![0]).toMatchObject({ sealState: 'sealed', step: 'done', leftoverCount: 4, dailyIssueCount: 0 })
  })

  it('sealed 且封存時沒有未處理的件：整句改寫，沒有看清單按鈕', async () => {
    useGrid(() => sealedGrid([1, 2], 0))
    const wrapper = mountBar()
    await flushPromises()
    const banner = wrapper.get('[data-test="progress-sealed"]')
    expect(banner.text()).toContain('封存時沒有未處理的件。')
    expect(banner.text()).not.toContain('已照系統規則算進薪資')
    expect(wrapper.find('[data-test="progress-show-leftover"]').exists()).toBe(false)
  })

  it('sealed 的月份早於今天所在月份：多一顆「前往 N 月」；同月或更晚就沒有', async () => {
    useGrid(() => sealedGrid([1, 2]))
    const past = mountBar()
    await flushPromises()
    expect(past.get('[data-test="progress-go-month"]').text()).toBe('前往 10 月')
    await past.get('[data-test="progress-go-month"]').trigger('click')
    expect(past.emitted('go-month')).toEqual([[{ year: 2026, month: 10 }]])

    vi.setSystemTime(new Date('2026-09-25T04:00:00Z')) // 台北 9/25：9 月就是今天所在月份
    const same = mountBar()
    await flushPromises()
    expect(same.find('[data-test="progress-go-month"]').exists()).toBe(false)
  })

  it('前往下個月：12 月跨年變成隔年 1 月', async () => {
    anchor.value = '2026-12-10'
    const DEC = ['2026-12-14', '2026-12-15', '2026-12-16']
    useGrid(() => grid({ today: '2026-12-21', days: DEC.map((d) => day(d)), cells: [cell(1, DEC[0], { edit: SEALED, actual: MATCHED })], employees: [employee(1, '林班導')] }))
    vi.setSystemTime(new Date('2027-01-10T04:00:00Z'))
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.get('[data-test="progress-go-month"]').text()).toBe('前往 1 月')
    await wrapper.get('[data-test="progress-go-month"]').trigger('click')
    expect(wrapper.emitted('go-month')).toEqual([[{ year: 2027, month: 1 }]])
  })

  it('沒有出勤讀取權限：封存橫幅只寫標題，不寫「沒有未處理的件」（看不到打卡就無從判斷）', async () => {
    perms.set = new Set(['SCHEDULE', 'SALARY_READ'])
    useGrid(() => sealedGrid([1, 2]))
    const wrapper = mountBar()
    await flushPromises()
    const banner = wrapper.get('[data-test="progress-sealed"]')
    expect(banner.text()).toContain('9 月薪資已封存')
    expect(banner.text()).not.toContain('封存時')
  })

  it('partial：照常顯示步驟列，另加一行說明幾人封存、其餘幾人照常核對', async () => {
    useGrid(() => sealedGrid([1]))
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('ol').exists()).toBe(true)
    expect(wrapper.find('[data-test="progress-sealed"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="progress-partial"]').text()).toBe('已有 1 人的薪資封存，他們的出勤只能看；其餘 1 人照常核對。')
    expect(wrapper.emitted('summary')!.at(-1)![0]).toMatchObject({ sealState: 'partial' })
  })

  it('open：沒有 partial 那一行', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-partial"]').exists()).toBe(false)
  })
})

describe('MonthProgressBar 手機膠囊', () => {
  const capsule = '[data-test="progress-capsule"]'

  it('只顯示一顆膠囊（主文＝目前步驟、副文＝下一步摘要），點了才展開完整步驟列', async () => {
    useGrid(fullPatternGrid)
    const wrapper = mountBar({ mobile: true })
    await flushPromises()
    expect(wrapper.find('ol').exists()).toBe(false)
    const button = wrapper.get(capsule)
    expect(button.get('[data-test="progress-capsule-main"]').text()).toBe('先修設定問題・1 人')
    expect(button.get('[data-test="progress-capsule-sub"]').text()).toBe('修好可清掉 3 件，之後還有 1 件逐日待辦')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('ol').exists()).toBe(true)
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('ol').exists()).toBe(false)
  })

  it('主文隨步驟：匯入打卡／處理待辦・剩 N 件／等老師回覆換班／交薪資', async () => {
    const main = (wrapper: ReturnType<typeof mountBar>) => wrapper.get('[data-test="progress-capsule-main"]').text()
    const importing = mountBar({ mobile: true })
    await flushPromises()
    expect(main(importing)).toBe('匯入打卡')

    useGrid(dailyGrid)
    const daily = mountBar({ mobile: true })
    await flushPromises()
    expect(main(daily)).toBe('處理待辦・剩 3 件')

    api.rounds.mockResolvedValue({ data: [ROUND] })
    api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 2)] } })
    useGrid(cleanGrid)
    const confirm = mountBar({ mobile: true })
    await flushPromises()
    expect(main(confirm)).toBe('等老師回覆換班')

    api.rounds.mockResolvedValue({ data: [] })
    const payroll = mountBar({ mobile: true })
    await flushPromises()
    expect(main(payroll)).toBe('交薪資')
  })

  it('膠囊至少 60px 高、全寬', () => {
    const css = readFileSync(resolve(__dirname, '../MonthProgressBar.vue'), 'utf8')
    const rule = css.match(/\.month-progress__capsule \{([^}]*)\}/)![1]
    expect(rule).toMatch(/min-height:\s*60px/)
    expect(rule).toMatch(/width:\s*100%/)
  })

  it('partial：說明那一行跟著展開才出現；sealed：照樣顯示橫幅、沒有膠囊', async () => {
    useGrid(() => sealedGrid([1]))
    const partial = mountBar({ mobile: true })
    await flushPromises()
    expect(partial.find('[data-test="progress-partial"]').exists()).toBe(false)
    await partial.get(capsule).trigger('click')
    expect(partial.find('[data-test="progress-partial"]').exists()).toBe(true)

    useGrid(() => sealedGrid([1, 2]))
    const sealed = mountBar({ mobile: true })
    await flushPromises()
    expect(sealed.find(capsule).exists()).toBe(false)
    expect(sealed.get('[data-test="progress-sealed"]').text()).toContain('9 月薪資已封存')
  })

  it('載入中膠囊停用；載入失敗只留錯誤與重試', async () => {
    api.grid.mockImplementationOnce(() => new Promise(() => {}))
    const loading = mountBar({ mobile: true })
    await flushPromises()
    expect(loading.get(capsule).attributes('disabled')).toBeDefined()

    api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
    const failed = mountBar({ mobile: true })
    await flushPromises()
    expect(failed.find(capsule).exists()).toBe(false)
    expect(failed.get('[data-test="progress-error"]').text()).toContain('伺服器錯誤')
  })
})

describe('MonthProgressBar 對外介面', () => {
  it('openPatterns 打開本月設定檢查抽屜；沒有型態時不開', async () => {
    useGrid(fullPatternGrid)
    const wrapper = mountBar({ stubTeleport: false })
    await flushPromises()
    const drawer = () => wrapper.findAllComponents(ElDrawer).find((d) => d.props('title') === '本月設定檢查')!
    ;(wrapper.vm as unknown as { openPatterns: () => void }).openPatterns()
    await flushPromises()
    expect(drawer().props('modelValue')).toBe(true)
    wrapper.unmount()

    useGrid(cleanGrid)
    const none = mountBar({ stubTeleport: false })
    await flushPromises()
    ;(none.vm as unknown as { openPatterns: () => void }).openPatterns()
    await flushPromises()
    expect(none.findAllComponents(ElDrawer).find((d) => d.props('title') === '本月設定檢查')!.props('modelValue')).toBe(false)
    none.unmount()
  })
})

const ROUND = { id: 3, status: 'open' as const, period_start: '2026-09-01', period_end: '2026-09-30', deadline_date: '2026-10-05', eligible_count: 3, released_by: 'admin', released_at: '2026-10-01T09:00:00' }
const progressEmp = (id: number, awaiting: number) => ({ employee_id: id, employee_name: `員工${id}`, item_count: 1, awaiting_response: awaiting, agreed: 0, disputed: 0, applied: 0, escalated: false, signed: awaiting === 0 })

describe('MonthProgressBar ④老師確認狀態（D-07）', () => {
  it('進行中：寫「已回覆 已回覆/應確認」，以本月期間查輪次', async () => {
    api.rounds.mockResolvedValue({ data: [ROUND] })
    api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 0), progressEmp(2, 1), progressEmp(3, 0)] } })
    const wrapper = mountBar()
    await flushPromises()
    expect(api.rounds).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(api.round).toHaveBeenCalledWith(3)
    expect(wrapper.find('[data-test="progress-rounds-status"]').text()).toBe('已回覆 2 / 3')
  })

  it('已關閉或沒有輪次＝沒有進行中（已關閉不再查進度）', async () => {
    api.rounds.mockResolvedValueOnce({ data: [{ ...ROUND, status: 'closed' }] })
    const closed = mountBar()
    await flushPromises()
    expect(closed.find('[data-test="progress-rounds-status"]').text()).toBe('沒有進行中')
    expect(api.round).not.toHaveBeenCalled()
    api.rounds.mockResolvedValueOnce({ data: [] })
    const none = mountBar()
    await flushPromises()
    expect(none.find('[data-test="progress-rounds-status"]').text()).toBe('沒有進行中')
  })

  it('讀輪次失敗：寫沒有進行中（不殘留舊進度），按鈕照常可開抽屜', async () => {
    api.rounds.mockRejectedValueOnce(new Error('x'))
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-rounds-status"]').text()).toBe('沒有進行中')
    expect(wrapper.find('[data-test="progress-rounds"]').exists()).toBe(true)
  })

  it('整月資料重抓（revision）後狀態一起重讀', async () => {
    mountBar()
    await flushPromises()
    revision.value += 1
    await flushPromises()
    expect(api.rounds).toHaveBeenCalledTimes(2)
  })

  it('沒有確認輪次權限：不查也不顯示', async () => {
    perms.set = new Set(['SCHEDULE', 'SALARY_READ'])
    const wrapper = mountBar()
    await flushPromises()
    expect(api.rounds).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="progress-rounds-status"]').exists()).toBe(false)
  })

  describe('換月或載入失敗：不殘留上個月的狀態（改顯示載入中「…」或失敗「—」）', () => {
    const STATUS = '[data-test="progress-rounds-status"]'
    // 9 月有進行中輪次（已回覆 2/3）
    function open9() {
      api.rounds.mockResolvedValue({ data: [ROUND] })
      api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 0), progressEmp(2, 1), progressEmp(3, 0)] } })
    }

    it('換月且新月整月請求還沒回來：舊月狀態立即消失', async () => {
      open9()
      const wrapper = mountBar()
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('已回覆 2 / 3')
      api.grid.mockImplementationOnce(() => new Promise(() => {})) // 10 月整月請求懸住
      anchor.value = '2026-10-05'
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('…')
    })

    it('新月整月請求失敗：不顯示任何輪次狀態', async () => {
      open9()
      const wrapper = mountBar()
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('已回覆 2 / 3')
      api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
      anchor.value = '2026-10-05'
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('—')
      expect(wrapper.find('[data-test="progress-error"]').exists()).toBe(true)
    })

    it('同月 revision 重抓失敗：不留著重抓前的狀態', async () => {
      open9()
      const wrapper = mountBar()
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('已回覆 2 / 3')
      api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
      revision.value += 1
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('—')
    })

    it('亂序：舊月的輪次請求換月後才回來，不得寫回舊月狀態', async () => {
      let resolveOld!: (v: { data: (typeof ROUND)[] }) => void
      api.rounds.mockImplementationOnce(() => new Promise((r) => { resolveOld = r })) // 9 月輪次請求懸住
      api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 0), progressEmp(2, 1), progressEmp(3, 0)] } })
      const wrapper = mountBar()
      await flushPromises()
      expect(api.rounds).toHaveBeenCalledTimes(1)
      api.grid.mockImplementationOnce(() => new Promise(() => {})) // 10 月整月請求也懸住，狀態不會被新月請求覆寫
      anchor.value = '2026-10-05'
      await flushPromises()
      resolveOld({ data: [ROUND] })
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('…')
    })
  })
})

describe('MonthProgressBar ④ 補登待處理（SPEC-026 3-3 P18）', () => {
  const STATUS = '[data-test="progress-rounds-status"]'
  const backdated = (id: number, status: string) => ({ id, round_id: null, status, initiated_by: 'employee' })

  it('沒有輪次但有老師補登待處理：照樣顯示，以本月期間查詢', async () => {
    api.unrounded.mockResolvedValue({ data: [backdated(1, 'agreed'), backdated(2, 'disputed'), backdated(3, 'pending')] })
    const wrapper = mountBar()
    await flushPromises()
    expect(api.unrounded).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(wrapper.find(STATUS).text()).toBe('沒有進行中・補登待處理 2')
  })

  it('輪次進行中：接在輪次狀態後面', async () => {
    api.rounds.mockResolvedValue({ data: [ROUND] })
    api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 0), progressEmp(2, 1), progressEmp(3, 0)] } })
    api.unrounded.mockResolvedValue({ data: [backdated(1, 'agreed')] })
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find(STATUS).text()).toBe('已回覆 2 / 3・補登待處理 1')
  })

  it('N 為 0（只有等對方回覆的）不顯示', async () => {
    api.unrounded.mockResolvedValue({ data: [backdated(3, 'pending')] })
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find(STATUS).text()).toBe('沒有進行中')
  })

  it('讀補登清單失敗：輪次狀態照常顯示，不跟著消失', async () => {
    api.rounds.mockResolvedValue({ data: [{ ...ROUND, status: 'closed' }] })
    api.unrounded.mockRejectedValue(new Error('x'))
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find(STATUS).text()).toBe('沒有進行中')
  })

  it('整月資料重抓（revision）後一起重讀', async () => {
    mountBar()
    await flushPromises()
    revision.value += 1
    await flushPromises()
    expect(api.unrounded).toHaveBeenCalledTimes(2)
  })

  it('沒有確認輪次權限：不查補登清單', async () => {
    perms.set = new Set(['SCHEDULE', 'SALARY_READ'])
    mountBar()
    await flushPromises()
    expect(api.unrounded).not.toHaveBeenCalled()
  })
})

describe('MonthProgressBar 本月設定檢查', () => {
  // 員工 1 在已匯入的 9/14–9/16 都是資料待補（匯入檔裡沒有他）＝整月沒有打卡的型態
  function patternGrid() {
    return grid({
      today: '2026-09-21',
      days: WEEK.map((d, i) => day(d, { import_covered: i < 3 })),
      cells: [
        ...WEEK.slice(0, 3).map((d) => cell(1, d, { actual: { status: 'data_incomplete' } })),
        cell(2, WEEK[0], { actual: { status: 'anomaly' } }),
      ],
    })
  }

  // 抽屜 teleport 到 body：不 stub teleport 才找得到 ElDrawer；清單內容從元件 wrapper 找
  const patternDrawer = (wrapper: ReturnType<typeof mountBar>) => wrapper.findAllComponents(ElDrawer).find((d) => d.props('title') === '本月設定檢查')!

  it('有型態時「先修設定」寫出幾個人、修好可清掉幾件，點開側邊清單', async () => {
    api.grid.mockImplementation(async () => ({ data: patternGrid() }))
    const wrapper = mountBar({ stubTeleport: false })
    await flushPromises()
    const link = wrapper.get('[data-test="progress-patterns"]')
    // 設定問題（整月同型態）和逐日待辦分開寫：員工 1 的 3 件是型態，員工 2 的 1 件才是逐日要處理的
    expect(link.text()).toContain('1 人，修好可清掉 3 件')
    expect(wrapper.get('[data-test="progress-issues"]').text()).toContain('1 件')
    // 兩個數字分開送給頁面（匯出月報前的提醒加總兩者）
    expect(wrapper.emitted('summary')!.at(-1)![0]).toMatchObject({ patternPeople: 1, patternIssueCount: 3, dailyIssueCount: 1 })
    await link.trigger('click')
    await flushPromises()
    expect(patternDrawer(wrapper).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(AttendancePatternList).find('[data-test="pattern-1"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('清單的看他整月與匯入打卡往上送給頁面，並收起清單', async () => {
    api.grid.mockImplementation(async () => ({ data: patternGrid() }))
    perms.set = new Set(['SCHEDULE', 'ATTENDANCE_READ', 'ATTENDANCE_WRITE', 'SALARY_READ'])
    const wrapper = mountBar({ stubTeleport: false })
    await flushPromises()
    await wrapper.get('[data-test="progress-patterns"]').trigger('click')
    await flushPromises()
    await wrapper.findComponent(AttendancePatternList).get('[data-test="pattern-records-1"]').trigger('click')
    expect(wrapper.emitted('records')).toEqual([[1, '2026-09-14']])
    expect(patternDrawer(wrapper).props('modelValue')).toBe(false)
    await wrapper.get('[data-test="progress-patterns"]').trigger('click')
    await flushPromises()
    await wrapper.findComponent(AttendancePatternList).get('[data-test="pattern-import-1"]').trigger('click')
    expect(wrapper.emitted('import')).toHaveLength(1)
    expect(patternDrawer(wrapper).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('清單的「重算本月出勤」往上送給頁面並收起清單', async () => {
    api.grid.mockImplementation(async () => ({ data: patternGrid() }))
    const wrapper = mountBar({ stubTeleport: false })
    await flushPromises()
    await wrapper.get('[data-test="progress-patterns"]').trigger('click')
    await flushPromises()
    wrapper.findComponent(AttendancePatternList).vm.$emit('recalculate')
    await flushPromises()
    expect(wrapper.emitted('recalculate')).toHaveLength(1)
    expect(patternDrawer(wrapper).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('沒有型態：寫「沒有」且不能點；沒有出勤讀取權限：這一步整個不出現', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.get('[data-test="progress-patterns"]').text()).toContain('沒有')
    expect(wrapper.get('[data-test="progress-patterns"]').attributes('disabled')).toBeDefined()
    api.grid.mockImplementation(async () => ({ data: patternGrid() }))
    perms.set = new Set(['SCHEDULE', 'SALARY_READ'])
    const noRead = mountBar()
    await flushPromises()
    expect(noRead.find('[data-test="progress-patterns"]').exists()).toBe(false)
  })
})
