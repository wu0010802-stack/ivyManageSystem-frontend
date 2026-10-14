import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { effectScope, ref } from 'vue'
import ElementPlus, { ElDrawer } from 'element-plus'
import { useMonthGrid } from '@/composables/useMonthGrid'
import MonthProgressBar from '../MonthProgressBar.vue'
import { cell, day, grid, WEEK } from './gridFixtures'

const api = vi.hoisted(() => ({ grid: vi.fn(), rounds: vi.fn(), round: vi.fn() }))
const perms = vi.hoisted(() => ({ set: new Set(['SCHEDULE', 'ATTENDANCE_READ', 'SALARY_READ']) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/attendanceConfirmation', () => ({ listConfirmationRounds: api.rounds, getConfirmationRound: api.round }))
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
function mountBar(options: { stubTeleport?: boolean } = {}) {
  const scope = effectScope()
  scopes.push(scope)
  const month = scope.run(() => useMonthGrid(anchor, revision))!
  return mount(MonthProgressBar, {
    props: { month },
    global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub, ...(options.stubTeleport === false ? {} : { teleport: true }) } },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  perms.set = new Set(['SCHEDULE', 'ATTENDANCE_READ', 'SALARY_READ'])
  anchor.value = '2026-09-16'
  revision.value = 0
  // 每次回新物件（同真 API）；否則 revision 重抓時 data 指向同一物件、watch 不觸發
  api.grid.mockImplementation(async () => ({ data: monthGrid() }))
  api.rounds.mockResolvedValue({ data: [] })
})

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})

describe('MonthProgressBar', () => {
  it('以整月格子統計未排班人日、匯入涵蓋與待處理格數', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(wrapper.find('[data-test="progress-schedule"]').text()).toContain('2 人日用預設工時')
    expect(wrapper.find('[data-test="progress-import"]').text()).toContain('已匯入至 9/16')
    expect(wrapper.find('[data-test="progress-issues"]').text()).toContain('本月 1 格待處理')
    // 匯出月報前的提醒要用同一份數字（9/17、9/18 是到昨天為止沒匯入的工作日）
    expect(wrapper.emitted('summary')!.at(-1)).toEqual([{ month: '2026-09-01', issues: 1, missingImportDays: 2 }])
    await wrapper.find('[data-test="progress-issues"]').trigger('click')
    expect(wrapper.emitted('show-issues')).toHaveLength(1)
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/salary/settle')
  })

  it('整天未匯入的「資料待補」不算待處理；「已匯入至」之前的缺口要寫出來', async () => {
    const NONE = { status: 'data_incomplete' as const, punch_in: null, punch_out: null }
    api.grid.mockResolvedValue({
      data: grid({
        today: '2026-09-21',
        days: WEEK.map((d, i) => day(d, { import_covered: i !== 1 })), // 9/15 整天沒匯入
        cells: [cell(1, WEEK[1], { actual: NONE }), cell(2, WEEK[0], { actual: NONE })],
      }),
    })
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-import"]').text()).toContain('已匯入至 9/20，缺 9/15')
    expect(wrapper.find('[data-test="progress-issues"]').text()).toContain('本月 1 格待處理') // 只算 9/14 那格
  })

  it('提醒文字用達 AA 的深色警示色（原本 #e6a23c 在淺底只有 2.1:1）', () => {
    const css = readFileSync(resolve(__dirname, '../MonthProgressBar.vue'), 'utf8')
    expect(css).toMatch(/\.month-progress__warn \{[^}]*color: var\(--color-warning-darker\)/)
  })

  it('只有排班與薪資讀取權限：只看得到排班與交薪資兩步', async () => {
    perms.set = new Set(['SCHEDULE', 'SALARY_READ'])
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-import"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="progress-issues"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="progress-rounds"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="progress-schedule"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="progress-salary"]').exists()).toBe(true)
  })

  it('沒有 SALARY_READ：交薪資只顯示純文字，不是連結（點了會被路由守衛擋下）', async () => {
    perms.set = new Set(['SCHEDULE', 'ATTENDANCE_READ'])
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-salary"]').exists()).toBe(false)
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(wrapper.find('[data-test="progress-salary-text"]').text()).toBe('交薪資')
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

  it('載入失敗：不顯示已排滿或 0 格待處理，提供重試', async () => {
    api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
    const wrapper = mountBar()
    await flushPromises()
    const text = wrapper.text()
    expect(text).not.toContain('已排滿')
    expect(text).not.toContain('0 格待處理')
    expect(text).not.toContain('人日用預設工時')
    expect(wrapper.find('[data-test="progress-error"]').text()).toContain('伺服器錯誤')
    expect(wrapper.find('[data-test="progress-issues"]').text()).toContain('—')
    // 載入失敗不送統計：頁面不能把「沒資料」當成「都處理完」而放行匯出月報
    expect(wrapper.emitted('summary')).toBeUndefined()
    await wrapper.find('[data-test="progress-retry"]').trigger('click')
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="progress-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="progress-schedule"]').text()).toContain('2 人日用預設工時')
  })

  it('關閉老師確認抽屜時通知頁殼 changed', async () => {
    // 抽屜 teleport 到 body；不用 teleport stub，否則 VTU 找不到 ElDrawer 元件
    const wrapper = mountBar({ stubTeleport: false })
    await flushPromises()
    await wrapper.find('[data-test="progress-rounds"]').trigger('click')
    await flushPromises()
    wrapper.findComponent(ElDrawer).vm.$emit('closed')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
})

const ROUND = { id: 3, status: 'open' as const, period_start: '2026-09-01', period_end: '2026-09-30', deadline_date: '2026-10-05', eligible_count: 3, released_by: 'admin', released_at: '2026-10-01T09:00:00' }
const progressEmp = (id: number, awaiting: number) => ({ employee_id: id, employee_name: `員工${id}`, item_count: 1, awaiting_response: awaiting, agreed: 0, disputed: 0, applied: 0, escalated: false, signed: awaiting === 0 })

describe('MonthProgressBar ④老師確認狀態（D-07）', () => {
  it('進行中：按鈕旁寫「確認中・已回覆 已回覆/應確認」，以本月期間查輪次', async () => {
    api.rounds.mockResolvedValue({ data: [ROUND] })
    api.round.mockResolvedValue({ data: { round: ROUND, items: [], employees: [progressEmp(1, 0), progressEmp(2, 1), progressEmp(3, 0)] } })
    const wrapper = mountBar()
    await flushPromises()
    expect(api.rounds).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(api.round).toHaveBeenCalledWith(3)
    expect(wrapper.find('[data-test="progress-rounds-status"]').text()).toBe('確認中・已回覆 2/3')
  })

  it('已關閉＝已結束（不再查進度）；沒有輪次＝尚未發送', async () => {
    api.rounds.mockResolvedValueOnce({ data: [{ ...ROUND, status: 'closed' }] })
    const closed = mountBar()
    await flushPromises()
    expect(closed.find('[data-test="progress-rounds-status"]').text()).toBe('已結束')
    expect(api.round).not.toHaveBeenCalled()
    api.rounds.mockResolvedValueOnce({ data: [] })
    const none = mountBar()
    await flushPromises()
    expect(none.find('[data-test="progress-rounds-status"]').text()).toBe('尚未發送')
  })

  it('讀輪次失敗：不顯示狀態，按鈕照常可開抽屜', async () => {
    api.rounds.mockRejectedValueOnce(new Error('x'))
    const wrapper = mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="progress-rounds-status"]').exists()).toBe(false)
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

  describe('換月或載入失敗：不殘留上個月的狀態', () => {
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
      expect(wrapper.find(STATUS).text()).toBe('確認中・已回覆 2/3')
      api.grid.mockImplementationOnce(() => new Promise(() => {})) // 10 月整月請求懸住
      anchor.value = '2026-10-05'
      await flushPromises()
      expect(wrapper.find(STATUS).exists()).toBe(false)
    })

    it('新月整月請求失敗：不顯示任何輪次狀態', async () => {
      open9()
      const wrapper = mountBar()
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('確認中・已回覆 2/3')
      api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
      anchor.value = '2026-10-05'
      await flushPromises()
      expect(wrapper.find(STATUS).exists()).toBe(false)
      expect(wrapper.find('[data-test="progress-error"]').exists()).toBe(true)
    })

    it('同月 revision 重抓失敗：不留著重抓前的狀態', async () => {
      open9()
      const wrapper = mountBar()
      await flushPromises()
      expect(wrapper.find(STATUS).text()).toBe('確認中・已回覆 2/3')
      api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
      revision.value += 1
      await flushPromises()
      expect(wrapper.find(STATUS).exists()).toBe(false)
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
      expect(wrapper.find(STATUS).exists()).toBe(false)
    })
  })
})
