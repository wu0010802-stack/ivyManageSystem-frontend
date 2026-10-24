// @vitest-environment jsdom
/**
 * 出席頁：F17 修補的審查補強（2026-10-04 家長端深掃獨立審查 FE-R2）。
 * (a) 所選日卡不可是點選當下的資料快照——下拉重整後同日備註變了，詳情卡要跟著新資料。
 * (b) 換月份後若新月份載入失敗，不可在新月份標題下繼續顯示前一個月的統計，
 *     要顯示可重試的錯誤。所有 API 為合成 mock。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const h = vi.hoisted(() => ({ monthly: vi.fn() }))
const selectedId = ref<number | null>(1)
vi.mock('@/parent/api/attendance', () => ({ getMonthlyAttendance: h.monthly }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({ items: [{ student_id: 1 }], load: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId, ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn() } }))
import AttendanceView from '../AttendanceView.vue'

const wrappers: VueWrapper[] = []
const now = new Date()
const day1 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
const monthPayload = (remark: string, days: number) => ({ data: {
  items: [{ date: day1, status: '出席', remark }], counts: { 出席: days }, recorded_days: days,
} })

async function render() {
  const w = mount(AttendanceView, { global: { stubs: {
    ChildContextHeader: true,
    PullToRefresh: { props: ['onRefresh'], template: '<div><button class="ptr-trigger" @click="onRefresh()" /><slot /></div>' },
  } } })
  wrappers.push(w)
  await flushPromises()
  return w
}

beforeEach(() => {
  selectedId.value = 1
  h.monthly.mockReset()
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('AttendanceView 詳情卡與統計跟著目前查詢', () => {
  it('下拉重整後同日備註改變，詳情卡顯示新備註', async () => {
    h.monthly.mockResolvedValueOnce(monthPayload('合成舊備註', 1))
    const w = await render()
    await w.find(`.cell[aria-label="${day1} 出席"]`).trigger('click')
    expect(w.find('.detail').text()).toContain('合成舊備註')

    h.monthly.mockResolvedValueOnce(monthPayload('合成新備註', 1))
    await w.find('.ptr-trigger').trigger('click')
    await flushPromises()

    expect(w.find('.detail').text()).toContain('合成新備註')
    expect(w.find('.detail').text()).not.toContain('合成舊備註')
  })

  it('換到上個月且載入失敗：不顯示前一個月的統計，改顯示可重試錯誤', async () => {
    h.monthly.mockResolvedValueOnce(monthPayload('本月', 7))
    const w = await render()
    expect(w.find('.summary-row').text()).toContain('7')

    h.monthly.mockRejectedValueOnce(new Error('synthetic 500'))
    await w.find('button[aria-label="上個月"]').trigger('click')
    await flushPromises()

    expect(w.find('.summary-row').exists()).toBe(false)
    expect(w.findComponent(MobileErrorRetry).exists()).toBe(true)
  })
})
