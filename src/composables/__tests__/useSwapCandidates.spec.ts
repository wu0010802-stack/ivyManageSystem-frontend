import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSwapCandidates, getDayRoster } = vi.hoisted(() => ({
  getSwapCandidates: vi.fn(),
  getDayRoster: vi.fn(),
}))
vi.mock('@/api/portal', () => ({ getSwapCandidates, getDayRoster }))
import { useSwapCandidates } from '../useSwapCandidates'
import { todayTaipeiISO } from '@/utils/format'

const cand = (id: number, name = `T${id}`) => ({
  employee_id: id, name, shift_name: '早班', work_start: '08:00', work_end: '17:00', has_pending_swap: false,
})
const rosterRow = (id: number, same: boolean) => ({
  employee_id: id, name: `T${id}`, shift_name: '早車', work_start: '07:00', work_end: '16:30',
  same_time_as_me: same, source: 'weekly',
})
function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useSwapCandidates', () => {
  beforeEach(() => vi.resetAllMocks())

  it('同時抓候選與 roster、併入職務加註並把時段相同者排最後', async () => {
    getSwapCandidates.mockResolvedValue({ data: [cand(1), cand(2)] })
    getDayRoster.mockResolvedValue({ data: [rosterRow(1, true), rosterRow(2, false)] })
    const state = useSwapCandidates()
    await expect(state.load('2026-10-20')).resolves.toBe(true)
    expect(getSwapCandidates).toHaveBeenCalledWith({ date: '2026-10-20' })
    expect(getDayRoster).toHaveBeenCalledWith({ date: '2026-10-20' })
    expect(state.candidates.value.map((c) => c.employee_id)).toEqual([2, 1])
    expect(state.candidates.value[1]).toMatchObject({ same_time: true, duty_label: '早車 07:00~16:30' })
    expect(state.loading.value).toBe(false)
  })

  it('roster 失敗：降級為原本的候選清單（不加註、不報錯）', async () => {
    getSwapCandidates.mockResolvedValue({ data: [cand(1), cand(2)] })
    getDayRoster.mockRejectedValue(new Error('roster down'))
    const state = useSwapCandidates()
    await expect(state.load('2026-10-20')).resolves.toBe(true)
    expect(state.candidates.value).toEqual([cand(1), cand(2)])
  })

  it('roster 還沒回：候選一回就先顯示（不加註、loading 關閉），roster 回來再補註記並重排', async () => {
    const roster = deferred<{ data: unknown[] }>()
    getSwapCandidates.mockResolvedValue({ data: [cand(1), cand(2)] })
    getDayRoster.mockReturnValue(roster.promise)
    const state = useSwapCandidates()
    const p = state.load('2026-10-20')
    await new Promise((r) => setTimeout(r, 0)) // 讓候選請求先 resolve；roster 仍卡住
    expect(state.candidates.value).toEqual([cand(1), cand(2)])
    expect(state.loading.value).toBe(false)
    roster.resolve({ data: [rosterRow(1, true), rosterRow(2, false)] })
    await expect(p).resolves.toBe(true)
    expect(state.candidates.value.map((c) => c.employee_id)).toEqual([2, 1])
    expect(state.candidates.value[1]).toMatchObject({ same_time: true, duty_label: '早車 07:00~16:30' })
  })

  it('roster 回來前使用者已換日期：舊 roster 不得補註到新名單', async () => {
    const firstRoster = deferred<{ data: unknown[] }>()
    getSwapCandidates.mockResolvedValue({ data: [cand(1)] })
    getDayRoster.mockReturnValueOnce(firstRoster.promise).mockResolvedValueOnce({ data: [] })
    const state = useSwapCandidates()
    const p1 = state.load('2026-10-20')
    await new Promise((r) => setTimeout(r, 0))
    await state.load('2026-10-21')
    firstRoster.resolve({ data: [rosterRow(1, true)] })
    await expect(p1).resolves.toBe(true)
    expect(state.candidates.value).toEqual([cand(1)]) // 沒被舊 roster 加上 duty_label
  })

  it('候選請求失敗：回 false 並清空名單', async () => {
    getSwapCandidates.mockRejectedValue(new Error('boom'))
    getDayRoster.mockResolvedValue({ data: [rosterRow(1, false)] })
    const state = useSwapCandidates()
    await expect(state.load('2026-10-20')).resolves.toBe(false)
    expect(state.candidates.value).toEqual([])
    expect(state.loading.value).toBe(false)
  })

  it('較新的請求取代舊請求：舊回應不覆蓋名單，loading 以最新請求為準', async () => {
    const first = deferred<{ data: unknown[] }>()
    const second = deferred<{ data: unknown[] }>()
    getSwapCandidates.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    getDayRoster.mockResolvedValue({ data: [] })
    const state = useSwapCandidates()
    const p1 = state.load('2026-10-20')
    const p2 = state.load('2026-10-21')
    second.resolve({ data: [cand(2)] })
    await p2
    first.resolve({ data: [cand(1)] })
    await expect(p1).resolves.toBe(true)
    expect(state.candidates.value.map((c) => c.employee_id)).toEqual([2])
    expect(state.loading.value).toBe(false)
  })

  it('舊請求先回來時，最新請求還在跑 → loading 維持 true', async () => {
    const first = deferred<{ data: unknown[] }>()
    const second = deferred<{ data: unknown[] }>()
    getSwapCandidates.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    getDayRoster.mockResolvedValue({ data: [] })
    const state = useSwapCandidates()
    const p1 = state.load('2026-10-20')
    const p2 = state.load('2026-10-21')
    first.resolve({ data: [cand(1)] })
    await p1
    expect(state.loading.value).toBe(true)
    second.resolve({ data: [cand(2)] })
    await p2
    expect(state.loading.value).toBe(false)
    expect(state.candidates.value.map((c) => c.employee_id)).toEqual([2])
  })

  it('clear() 作廢進行中的請求並清空名單', async () => {
    const pending = deferred<{ data: unknown[] }>()
    getSwapCandidates.mockReturnValueOnce(pending.promise)
    getDayRoster.mockResolvedValue({ data: [] })
    const state = useSwapCandidates()
    const p = state.load('2026-10-20')
    state.clear()
    pending.resolve({ data: [cand(1)] })
    await p
    expect(state.candidates.value).toEqual([])
    expect(state.loading.value).toBe(false)
  })

  // 補登（SPEC-026 3-3）：換班日早於台北今天 → 候選併入 roster 時改用補登規則（排休也不可選）
  it('過去日期：排休的同事標為補登不可選', async () => {
    getSwapCandidates.mockResolvedValue({ data: [cand(1), cand(2)] })
    getDayRoster.mockResolvedValue({
      data: [
        { ...rosterRow(1, false), shift_name: null, work_start: null, work_end: null, source: 'daily_off' },
        rosterRow(2, false),
      ],
    })
    const state = useSwapCandidates()
    await expect(state.load('2020-01-06')).resolves.toBe(true)
    const byId = Object.fromEntries(state.candidates.value.map((c) => [c.employee_id, c]))
    expect(byId[1]!.unavailable_reason).toBe('補登換班限雙方當天都有排定班別')
    expect(byId[2]!.unavailable_reason).toBeUndefined()
  })

  it('未來日期：排休維持可選（3-1 規則不變）', async () => {
    getSwapCandidates.mockResolvedValue({ data: [cand(1)] })
    getDayRoster.mockResolvedValue({
      data: [{ ...rosterRow(1, false), shift_name: null, work_start: null, work_end: null, source: 'daily_off' }],
    })
    const state = useSwapCandidates()
    await expect(state.load('2099-01-04')).resolves.toBe(true)
    expect(state.candidates.value[0]!.unavailable_reason).toBeUndefined()
  })

  it('今天不算補登日（BE 以是否已打卡決定，前端無從預知）：排休維持可選', async () => {
    getSwapCandidates.mockResolvedValue({ data: [cand(1)] })
    getDayRoster.mockResolvedValue({
      data: [{ ...rosterRow(1, false), shift_name: null, work_start: null, work_end: null, source: 'daily_off' }],
    })
    const state = useSwapCandidates()
    await expect(state.load(todayTaipeiISO())).resolves.toBe(true)
    expect(state.candidates.value[0]!.unavailable_reason).toBeUndefined()
  })
})
