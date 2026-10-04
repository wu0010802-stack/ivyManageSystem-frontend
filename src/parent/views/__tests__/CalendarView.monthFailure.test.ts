// @vitest-environment jsdom
/** S04：切「整月」失敗時，標題／模式不得與仍是舊週的資料不一致，且可再按重試。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const weekMock = vi.fn()
const monthMock = vi.fn()
vi.mock('@/parent/api/calendar', () => ({
  getWeekAgenda: (...a: unknown[]) => weekMock(...a),
  getMonthAgenda: (...a: unknown[]) => monthMock(...a),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import CalendarView from '@/parent/views/CalendarView.vue'

const wrappers: VueWrapper[] = []
const monthBtn = (w: VueWrapper) => w.findAll('.day-filter button').find((b) => b.text() === '整月')!
beforeEach(() => {
  weekMock.mockReset().mockResolvedValue({ data: { items: [{ date: '2026-10-05', category: 'event', title: '合成週行程' }] } })
  monthMock.mockReset().mockRejectedValue(new Error('synthetic'))
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('CalendarView 切整月失敗（S04）', () => {
  it('失敗後回到與資料一致的「未來 N 天」，且再按整月會重新請求', async () => {
    const w = mount(CalendarView)
    wrappers.push(w)
    await flushPromises()
    await monthBtn(w).trigger('click')
    await flushPromises()
    expect(monthMock).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('合成週行程')
    expect(w.find('.pt-page-hero-title').text()).toBe('未來 7 天')
    expect(monthBtn(w).attributes('aria-pressed')).toBe('false')
    await monthBtn(w).trigger('click')
    await flushPromises()
    expect(monthMock).toHaveBeenCalledTimes(2)
  })
})
