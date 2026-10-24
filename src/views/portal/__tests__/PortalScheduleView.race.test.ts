import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import PortalScheduleView from '@/views/portal/PortalScheduleView.vue'
import ScheduleCalendarGrid from '@/views/portal/components/schedule/ScheduleCalendarGrid.vue'
import ScheduleMonthHeader from '@/views/portal/components/schedule/ScheduleMonthHeader.vue'

const api = vi.hoisted(() => ({
  getMySchedule: vi.fn(),
  getSwapRequests: vi.fn(),
  createSwapRequest: vi.fn(),
  respondToSwap: vi.fn(),
  cancelSwapRequest: vi.fn(),
  getSwapCandidates: vi.fn(),
  getDayRoster: vi.fn(),
}))
vi.mock('@/api/portal', () => api)
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: ref(false) }) }))

const STUBS = {
  PortalPageHeader: true,
  ScheduleMonthHeader: true,
  ScheduleCalendarGrid: true,
  ScheduleSwapTable: true,
  ScheduleSwapDialog: true,
  ElDrawer: true,
  ElCard: { template: '<div><slot name="header" /><slot /></div>' },
  ElButton: { template: '<button><slot /></button>' },
  ElTag: true,
}

const days = (prefix: string) => ({ days: [{ date: `${prefix}-01`, day: 1 }] })
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const firstDate = (w: ReturnType<typeof mount>) => {
  const weeks = w.findComponent(ScheduleCalendarGrid).props('weeks') as ({ date: string } | null)[][]
  return weeks.flat().find((d) => d)?.date ?? null
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  api.getSwapRequests.mockResolvedValue({ data: [] })
})

describe('PortalScheduleView 換月競態（QA #23）', () => {
  it('舊月回應晚到不蓋掉新月；換月時先清空舊月資料', async () => {
    const first = deferred<{ data: ReturnType<typeof days> }>()
    const second = deferred<{ data: ReturnType<typeof days> }>()
    api.getMySchedule.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const w = mount(PortalScheduleView, { global: { stubs: STUBS, directives: { loading: {} } } })
    await flushPromises()
    const header = w.findComponent(ScheduleMonthHeader)
    const { year, month } = api.getMySchedule.mock.calls[0][0] as { year: number; month: number }
    const cur = `${year}-${String(month).padStart(2, '0')}`
    first.resolve({ data: days(cur) })
    await flushPromises()
    expect(firstDate(w)).toBe(`${cur}-01`)

    // 換到下個月：舊資料先清空
    const third = deferred<{ data: ReturnType<typeof days> }>()
    api.getMySchedule.mockReset().mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
    header.vm.$emit('next')
    await flushPromises()
    expect(firstDate(w)).toBeNull()
    // 再換回來（第三個請求），第二個（下月）晚到
    header.vm.$emit('prev')
    await flushPromises()
    third.resolve({ data: days(cur) })
    await flushPromises()
    second.resolve({ data: days('2099-12') })
    await flushPromises()
    expect(firstDate(w)).toBe(`${cur}-01`)
  })
})
