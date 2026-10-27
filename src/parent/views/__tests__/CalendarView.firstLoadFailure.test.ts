// @vitest-environment jsdom
/** 首次載入就失敗：不得整片空白，要有重試入口，重試成功後顯示行程。 */
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const weekMock = vi.fn()
vi.mock('@/parent/api/calendar', () => ({
  getWeekAgenda: (...a: unknown[]) => weekMock(...a),
  getMonthAgenda: vi.fn(),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import CalendarView from '@/parent/views/CalendarView.vue'

describe('CalendarView 首次載入失敗', () => {
  it('顯示重試；重試成功後出現行程', async () => {
    weekMock.mockRejectedValueOnce(new Error('synthetic'))
    const w = mount(CalendarView)
    await flushPromises()
    const retry = w.findComponent({ name: 'MobileErrorRetry' })
    expect(retry.exists()).toBe(true)

    weekMock.mockResolvedValueOnce({ data: { items: [{ date: '2026-10-05', category: 'event', title: '合成週行程' }] } })
    retry.vm.$emit('retry')
    await flushPromises()
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.text()).toContain('合成週行程')
    w.unmount()
  })
})
