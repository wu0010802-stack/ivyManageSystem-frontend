import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useMonthGrid } from '../useMonthGrid'
import { grid, cell } from '@/components/schedule-attendance/__tests__/gridFixtures'

const api = vi.hoisted(() => ({ grid: vi.fn() }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))

function setup(date = '2026-09-16') {
  const anchor = ref(date)
  const revision = ref(0)
  const state = effectScope().run(() => useMonthGrid(anchor, revision))!
  return { anchor, revision, state }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.grid.mockImplementation(async ({ start_date }: { start_date: string }) => ({
    data: grid({ start_date, cells: [cell(1, '2026-09-14')] }),
  }))
})

describe('useMonthGrid', () => {
  it('開始即抓整月（1 日到月底），cells 以人日索引', async () => {
    const { state } = setup()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(state.range.value).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(state.cells.value.has('1|2026-09-14')).toBe(true)
    expect(state.loading.value).toBe(false)
  })

  it('同月換日期不重抓；換月重抓，且載入中不留舊月資料', async () => {
    const { anchor, state } = setup()
    await flushPromises()
    anchor.value = '2026-09-28'
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(1)
    let release: (v: unknown) => void = () => {}
    api.grid.mockReturnValueOnce(new Promise((r) => { release = r }))
    anchor.value = '2026-10-05'
    await flushPromises()
    expect(api.grid).toHaveBeenLastCalledWith({ start_date: '2026-10-01', end_date: '2026-10-31' })
    expect(state.data.value).toBeNull()
    release({ data: grid({ start_date: '2026-10-01' }) })
    await flushPromises()
    expect(state.data.value?.start_date).toBe('2026-10-01')
  })

  it('revision 變動即重抓', async () => {
    const { revision } = setup()
    await flushPromises()
    revision.value += 1
    await flushPromises()
    expect(api.grid).toHaveBeenCalledTimes(2)
  })

  it('舊月的回應晚到不蓋掉新月', async () => {
    let releaseOld: (v: unknown) => void = () => {}
    api.grid.mockReturnValueOnce(new Promise((r) => { releaseOld = r }))
    const { anchor, state } = setup()
    anchor.value = '2026-10-05'
    await flushPromises()
    releaseOld({ data: grid({ start_date: '2026-09-01' }) })
    await flushPromises()
    expect(state.data.value?.start_date).toBe('2026-10-01')
  })

  it('載入失敗：data 清空、給錯誤訊息；reload 重試成功後清掉錯誤', async () => {
    api.grid.mockRejectedValueOnce({ displayMessage: '伺服器錯誤' })
    const { state } = setup()
    await flushPromises()
    expect(state.data.value).toBeNull()
    expect(state.loadError.value).toBe('伺服器錯誤')
    await state.reload()
    expect(state.loadError.value).toBe('')
    expect(state.data.value).not.toBeNull()
  })
})
