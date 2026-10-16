// @vitest-environment jsdom
/** F17：換孩子／月份後，前一查詢所選的日卡與備註不得殘留。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ monthly: vi.fn() }))
const selectedId = ref<number | null>(1)
vi.mock('@/parent/api/attendance', () => ({ getMonthlyAttendance: h.monthly }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1 }, { student_id: 2 }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId, ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn() } }))
import AttendanceView from '../AttendanceView.vue'

const wrappers: VueWrapper[] = []
const dateKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`
const now = new Date()
const initialDate = dateKey(now.getFullYear(), now.getMonth() + 1)
async function renderSelectedDay() {
  const w = mount(AttendanceView, { global: { stubs: {
    ChildContextHeader: true,
    PullToRefresh: { template: '<div><slot /></div>' },
  } } })
  wrappers.push(w)
  await flushPromises()
  await w.find(`.cell[aria-label="${initialDate} 出席"]`).trigger('click')
  expect(w.find('.detail').text()).toContain(`合成備註 1 ${initialDate}`)
  return w
}
beforeEach(() => {
  selectedId.value = 1
  h.monthly.mockReset()
  h.monthly.mockImplementation((sid: number, year: number, month: number) => Promise.resolve({ data: {
    items: [{ date: dateKey(year, month), status: '出席', remark: `合成備註 ${sid} ${dateKey(year, month)}` }],
    counts: { 出席: 1 }, recorded_days: 1,
  } }))
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('AttendanceView 所選日期卡不保留前一個查詢脈絡（F17）', () => {
  it('換孩子且新資料成功抵達後，不得仍顯示前一孩子備註', async () => {
    const w = await renderSelectedDay()
    selectedId.value = 2
    await flushPromises()
    expect(h.monthly).toHaveBeenLastCalledWith(2, now.getFullYear(), now.getMonth() + 1, expect.any(Object))
    // 可清掉選日或重新連結新孩子的當日資料；兩者都不可顯示甲的舊備註。
    expect(w.text()).not.toContain(`合成備註 1 ${initialDate}`)
  })

  it('切到下一月且新資料成功抵達後，不得保留前月所選日卡', async () => {
    const w = await renderSelectedDay()
    await w.find('button[aria-label="下個月"]').trigger('click')
    await flushPromises()
    expect(h.monthly).toHaveBeenCalledTimes(2)
    expect(w.find(`.cell[aria-label="${initialDate} 出席"]`).exists()).toBe(false)
    expect(w.text()).not.toContain(`合成備註 1 ${initialDate}`)
  })
})
