/**
 * HomeBusRow — 首頁娃娃車兩種入口。
 *
 * 本元件是從 TodayView 抽出的純結構搬移，行為必須與搬移前逐一致：
 *  - 追蹤卡只在班次進行中出現，連 /bus
 *  - 「今天不搭」入口吃 ride-cancellations，與 trip 生命週期無關（發車前就要在）
 *  - 站點座標（家庭住址）不得進入畫面
 *  - 送出與撤銷的 re-entrancy guard（雙擊不得覆寫第一發的結果）
 *
 * 本檔涵蓋原 TodayView.rideCancellation.test.ts 與 TodayView.busRace.test.ts 的
 * 行為斷言（2026-09-02 隨元件抽出搬移）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getBusToday = vi.fn()
const getRideCancellations = vi.fn()
const createRideCancellation = vi.fn()
const revokeRideCancellation = vi.fn()

vi.mock('@/parent/api/bus', () => ({
  getBusToday: (...a: unknown[]) => getBusToday(...a),
  getRideCancellations: (...a: unknown[]) => getRideCancellations(...a),
  createRideCancellation: (...a: unknown[]) => createRideCancellation(...a),
  revokeRideCancellation: (...a: unknown[]) => revokeRideCancellation(...a),
}))

import HomeBusRow from '@/parent/components/home/HomeBusRow.vue'

const stubs = {
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
  BusRideCancellationSheet: {
    // 明寫 name：inline stub 物件不會自動帶元件名，少了它
    // `findComponent({ name: 'BusRideCancellationSheet' })` 只會拿到空 wrapper。
    name: 'BusRideCancellationSheet',
    props: ['visible', 'childName', 'scheduledDirections', 'activeCancellations', 'submitting', 'results'],
    template: '<div data-testid="cancel-sheet">{{ childName }}</div>',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  getBusToday.mockResolvedValue({ data: { trip: null, children: [] } })
  getRideCancellations.mockResolvedValue({ data: { children: [] } })
})

describe('HomeBusRow 娃娃車追蹤卡', () => {
  it('班次進行中且還有站：顯示「還有 N 站」並連到 /bus', async () => {
    getBusToday.mockResolvedValue({
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'pending', stops_ahead: 3 }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('娃娃車')
    expect(w.text()).toContain('還有 3 站')
    expect(w.find('a[href="/bus"]').exists()).toBe(true)
  })

  it('已上車（stop_status 非 pending）：顯示「進行中」', async () => {
    getBusToday.mockResolvedValue({
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'boarded', stops_ahead: 0 }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('進行中')
  })

  it('班次未進行中：不渲染追蹤卡', async () => {
    getBusToday.mockResolvedValue({ data: { trip: { status: 'planned' }, children: [] } })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).not.toContain('娃娃車')
  })

  it('站點座標不得出現在畫面', async () => {
    getBusToday.mockResolvedValue({
      data: {
        trip: { status: 'in_progress' },
        children: [{ stop_status: 'pending', stops_ahead: 1, stop_lat: 22.6273, stop_lng: 120.3014 }],
      },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.html()).not.toContain('22.6273')
    expect(w.html()).not.toContain('120.3014')
  })

  it('娃娃車快照失敗不拋例外，元件仍可掛載', async () => {
    getBusToday.mockRejectedValue(new Error('boom'))
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})

describe('HomeBusRow 今天不搭入口', () => {
  it('有排定名單：逐子女一格，點擊開 sheet', async () => {
    getRideCancellations.mockResolvedValue({
      data: { children: [{ student_id: 7, student_name: '小明', scheduled_directions: ['morning'], cancellations: [] }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    const btn = w.find('[data-testid="bus-ride-cancel-7"]')
    expect(btn.exists()).toBe(true)
    expect(w.text()).toContain('今天不搭')
    await btn.trigger('click')
    expect(w.find('[data-testid="cancel-sheet"]').text()).toContain('小明')
  })

  it('已回報方向會顯示在副標', async () => {
    getRideCancellations.mockResolvedValue({
      data: {
        children: [{
          student_id: 7, student_name: '小明',
          scheduled_directions: ['morning', 'afternoon'],
          cancellations: [{ id: 1, direction: 'morning', revocable: true }],
        }],
      },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('早上接車已回報')
  })

  it('送出後重載名單，且同一 tick 雙擊只送一次', async () => {
    getRideCancellations.mockResolvedValue({
      data: { children: [{ student_id: 7, student_name: '小明', scheduled_directions: ['morning'], cancellations: [] }] },
    })
    createRideCancellation.mockResolvedValue({
      data: { results: [{ direction: 'morning', success: true, message: '已回報' }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    await w.find('[data-testid="bus-ride-cancel-7"]').trigger('click')
    const sheet = w.findComponent({ name: 'BusRideCancellationSheet' })
    sheet.vm.$emit('submit', ['morning'])
    sheet.vm.$emit('submit', ['morning'])
    await flushPromises()
    expect(createRideCancellation).toHaveBeenCalledTimes(1)
  })

  it('名單載入失敗不清空既有資料（sheet 不被抽走）', async () => {
    getRideCancellations
      .mockResolvedValueOnce({
        data: { children: [{ student_id: 7, student_name: '小明', scheduled_directions: ['morning'], cancellations: [] }] },
      })
      .mockRejectedValueOnce(new Error('network'))
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    await w.vm.reload()
    await flushPromises()
    expect(w.find('[data-testid="bus-ride-cancel-7"]').exists()).toBe(true)
  })
})
