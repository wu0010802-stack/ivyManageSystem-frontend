/**
 * 行事曆整月視圖。
 *
 * 後端 /parent/calendar/month 一直存在，前端只接了 week，家長因此
 * 看不到「這個月還有什麼活動」。頁面標題也從「本週行程」改為「行事曆」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const weekMock = vi.fn()
const monthMock = vi.fn()
vi.mock('@/parent/api/calendar', () => ({
  getWeekAgenda: (...a: unknown[]) => weekMock(...a),
  getMonthAgenda: (...a: unknown[]) => monthMock(...a),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import CalendarView from '@/parent/views/CalendarView.vue'

const emptyPayload = { data: { items: [] } }

beforeEach(() => {
  weekMock.mockReset().mockResolvedValue(emptyPayload)
  monthMock.mockReset().mockResolvedValue(emptyPayload)
})

async function mountCal() {
  const w = mount(CalendarView)
  await flushPromises()
  return w
}

/** 依按鈕文字找到範圍切換鈕 */
function rangeButton(w: ReturnType<typeof mount>, text: string) {
  const btn = w.findAll('.day-filter button').find((b) => b.text() === text)
  if (!btn) throw new Error(`找不到按鈕：${text}`)
  return btn
}

describe('CalendarView 範圍切換', () => {
  it('預設載入未來 7 天，不打 month', async () => {
    const w = await mountCal()
    expect(weekMock).toHaveBeenCalledWith(7)
    expect(monthMock).not.toHaveBeenCalled()
    w.unmount()
  })

  it('點「整月」改打 month 端點並帶當前年月', async () => {
    const w = await mountCal()
    await rangeButton(w, '整月').trigger('click')
    await flushPromises()

    expect(monthMock).toHaveBeenCalledTimes(1)
    const [year, month] = monthMock.mock.calls[0] as [number, number]
    const now = new Date()
    expect(year).toBe(now.getFullYear())
    expect(month).toBe(now.getMonth() + 1)
    w.unmount()
  })

  it('整月為 active 時再點一次不重複請求', async () => {
    const w = await mountCal()
    await rangeButton(w, '整月').trigger('click')
    await flushPromises()
    await rangeButton(w, '整月').trigger('click')
    await flushPromises()

    expect(monthMock).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('從整月切回天數會重新打 week', async () => {
    const w = await mountCal()
    await rangeButton(w, '整月').trigger('click')
    await flushPromises()
    await rangeButton(w, '3 天').trigger('click')
    await flushPromises()

    expect(weekMock).toHaveBeenLastCalledWith(3)
    w.unmount()
  })

  it('切換鈕以 aria-pressed 表達目前範圍', async () => {
    const w = await mountCal()
    expect(rangeButton(w, '7 天').attributes('aria-pressed')).toBe('true')
    expect(rangeButton(w, '整月').attributes('aria-pressed')).toBe('false')

    await rangeButton(w, '整月').trigger('click')
    await flushPromises()

    expect(rangeButton(w, '整月').attributes('aria-pressed')).toBe('true')
    expect(rangeButton(w, '7 天').attributes('aria-pressed')).toBe('false')
    w.unmount()
  })

  it('整月模式的空狀態文案講月份，不講天數', async () => {
    const w = await mountCal()
    await rangeButton(w, '整月').trigger('click')
    await flushPromises()

    const monthNo = new Date().getMonth() + 1
    expect(w.text()).toContain(`${monthNo} 月沒有特別行程`)
    w.unmount()
  })
})
