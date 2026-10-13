import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus, { ElDrawer } from 'element-plus'
import MonthProgressBar from '../MonthProgressBar.vue'
import { cell, day, grid, WEEK } from './gridFixtures'

const api = vi.hoisted(() => ({ grid: vi.fn() }))
const perms = vi.hoisted(() => ({ set: new Set(['SCHEDULE', 'ATTENDANCE_READ', 'SALARY_READ']) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
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

function mountBar(revision = 0) {
  return mount(MonthProgressBar, {
    props: { date: '2026-09-16', revision },
    global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub, teleport: true } },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  perms.set = new Set(['SCHEDULE', 'ATTENDANCE_READ', 'SALARY_READ'])
  api.grid.mockResolvedValue({ data: monthGrid() })
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
    const wrapper = mountBar()
    await flushPromises()
    await wrapper.setProps({ revision: 1 })
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(2)
  })

  it('同月換日期不重抓，換月才重抓', async () => {
    const wrapper = mountBar()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ date: '2026-09-20' })
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ date: '2026-10-05' })
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
    const wrapper = mount(MonthProgressBar, {
      props: { date: '2026-09-16', revision: 0 },
      global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    await wrapper.find('[data-test="progress-rounds"]').trigger('click')
    await flushPromises()
    wrapper.findComponent(ElDrawer).vm.$emit('closed')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
})
