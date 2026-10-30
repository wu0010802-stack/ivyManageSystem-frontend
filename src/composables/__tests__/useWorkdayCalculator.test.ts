import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import { useWorkdayCalculator } from '../useWorkdayCalculator'

/**
 * Bug sweep 2026-06-03 ⑤：編輯既有「自訂時段 / 半日」假單時，
 * populateFormFromRecord 先設 leaveMode='custom' 並填好實際時段，
 * 但 watch(leaveMode) 的 custom 分支會無條件把 start/end 重設成 08:00–17:00，
 * 覆寫載入的結束時間 → 連鎖把 leave_hours 重算成全日（扣薪/配額金額錯）。
 */
describe('useWorkdayCalculator — 編輯既有自訂時段假單', () => {
  it('populate 既有半日時段後不被 watch(leaveMode) 覆寫', async () => {
    const form = reactive<Record<string, unknown>>({
      employee_id: null,
      start_date: '',
      end_date: '',
      leave_hours: 8,
    })
    const calc = useWorkdayCalculator({ form })

    // 模擬 populateFormFromRecord 載入「上午半日 08:00–12:00」既有假單的賦值順序
    calc.leaveMode.value = 'custom'
    form.start_date = '2026-06-01 08:00:00'
    form.end_date = '2026-06-01 12:00:00'
    form.leave_hours = 4
    calc.leaveSingleDate.value = '2026-06-01'

    await nextTick()

    expect(form.start_date).toBe('2026-06-01 08:00:00')
    expect(form.end_date).toBe('2026-06-01 12:00:00')
  })

  it('使用者手動切到 custom（start_date 為純日期）仍套用預設 08:00–17:00', async () => {
    const form = reactive<Record<string, unknown>>({
      employee_id: null,
      start_date: '2026-06-02',
      end_date: '2026-06-02',
      leave_hours: 8,
    })
    const calc = useWorkdayCalculator({ form })

    calc.leaveMode.value = 'custom'
    await nextTick()

    expect(form.start_date).toBe('2026-06-02 08:00:00')
    expect(form.end_date).toBe('2026-06-02 17:00:00')
  })
})

/**
 * Finding [1]（P2）：半日模式下 workday API 失敗時，catch 走的 fallbackCalc 以
 * date-only 字串建 Date（同日 00:00–00:00）→ 誤算 0 分鐘 → 把 leave_hours 覆寫成 0.5h，
 * 但 start_date/end_date 仍是固定的 08:00–12:00（4h 範圍），造成自相矛盾。
 */
describe('useWorkdayCalculator — 半日模式 workday API 失敗保留 4h', () => {
  it('morning 模式 API 失敗時保留 4h（不被 fallbackCalc 誤算成 0.5h）', async () => {
    const form = reactive<Record<string, unknown>>({
      employee_id: 1,
      start_date: '',
      end_date: '',
      leave_hours: 8,
    })
    const fetchFn = () => Promise.reject(new Error('network down'))
    const calc = useWorkdayCalculator({ form, fetchFn })

    calc.leaveMode.value = 'morning'
    await nextTick()
    calc.leaveSingleDate.value = '2026-06-01'
    await nextTick()
    await flushPromises()

    expect(form.start_date).toBe('2026-06-01 08:00:00')
    expect(form.end_date).toBe('2026-06-01 12:00:00')
    expect(form.leave_hours).toBe(4)
  })

  it('afternoon 模式 API 失敗時保留 4h', async () => {
    const form = reactive<Record<string, unknown>>({
      employee_id: 1,
      start_date: '',
      end_date: '',
      leave_hours: 8,
    })
    const fetchFn = () => Promise.reject(new Error('network down'))
    const calc = useWorkdayCalculator({ form, fetchFn })

    calc.leaveMode.value = 'afternoon'
    await nextTick()
    calc.leaveSingleDate.value = '2026-06-02'
    await nextTick()
    await flushPromises()

    expect(form.start_date).toBe('2026-06-02 13:00:00')
    expect(form.end_date).toBe('2026-06-02 17:00:00')
    expect(form.leave_hours).toBe(4)
  })
})

/**
 * Finding [2]（P2）：fetchWorkdayHours 無 stale-response 守衛。快速切換日期會讓兩個請求
 * 同時在途，先發但後到的舊請求會透過 applyBreakdownResult 覆寫已被新請求更新的欄位。
 * 因 leave_hours 被 disable 直接送出，stale 值無法被使用者修正。
 */
describe('useWorkdayCalculator — 晚到舊請求不覆寫（epoch 守衛）', () => {
  it('切換日期後先發但後到的舊請求不得覆寫新請求結果', async () => {
    const form = reactive<Record<string, unknown>>({
      employee_id: 1,
      start_date: '',
      end_date: '',
      leave_hours: 8,
    })
    let resolveFirst!: (v: unknown) => void
    let resolveSecond!: (v: unknown) => void
    const responses: Promise<unknown>[] = [
      new Promise((r) => { resolveFirst = r }),
      new Promise((r) => { resolveSecond = r }),
    ]
    let idx = 0
    const fetchFn = () => responses[idx++]
    const calc = useWorkdayCalculator({ form, fetchFn })

    calc.leaveMode.value = 'morning'
    await nextTick()
    calc.leaveSingleDate.value = '2026-06-01' // 觸發第 1 次 fetch（epoch 1）
    await nextTick()
    calc.leaveSingleDate.value = '2026-06-02' // 觸發第 2 次 fetch（epoch 2）
    await nextTick()

    // 第 2 次（新）先回
    resolveSecond({
      data: {
        total_hours: 3.5,
        breakdown: [{ date: '2026-06-02', type: 'workday', work_start: '08:30', work_end: '12:00' }],
      },
    })
    await flushPromises()
    // 第 1 次（舊）後到 —— 不得覆寫成 06-01 09:00 / 3h
    resolveFirst({
      data: {
        total_hours: 3,
        breakdown: [{ date: '2026-06-01', type: 'workday', work_start: '09:00', work_end: '12:00' }],
      },
    })
    await flushPromises()

    expect(form.start_date).toBe('2026-06-02 08:30:00')
    expect(form.end_date).toBe('2026-06-02 12:00:00')
    expect(form.leave_hours).toBe(3.5)
  })
})

/**
 * 教師端深度掃描 F3：全天模式（date-only picker）API 失敗時，fallbackCalc 不可把同日
 * 00:00–00:00 當零長度時段而降成 0.5h；改走工作日×8h 預設班制，非工作日不得抬成 0.5h 放行。
 */
describe('useWorkdayCalculator — 全天模式 API 失敗 fallback（F3）', () => {
  const run = async (date: string) => {
    const form = reactive<Record<string, unknown>>({
      employee_id: 1,
      start_date: '',
      end_date: '',
      leave_hours: 8,
    })
    const calc = useWorkdayCalculator({ form, fetchFn: () => Promise.reject(new Error('network down')) })
    form.start_date = date
    form.end_date = date
    await nextTick()
    await new Promise((r) => setTimeout(r, 350)) // useDebounceFn 300ms
    await flushPromises()
    return { form, calc }
  }

  it('同日平日：保留 8h，而非 0.5h', async () => {
    const { form } = await run('2026-10-07') // 週三
    expect(form.leave_hours).toBe(8)
  })

  it('同日週末：leave_hours 為 0（交由 ≥ 0.5h 表單驗證擋下），不抬成 0.5h', async () => {
    const { form, calc } = await run('2026-10-10') // 週六
    expect(form.leave_hours).toBe(0)
    expect(calc.calcHint.value).toContain('非工作日')
  })
})

/**
 * 業主裁定 2026-10-30：請假時數由後端重算覆寫（送出時以伺服器時數寫入 leave_hours）。
 * 前端只顯示 workday-hours 回傳的 leave_hours；部分時段把起訖時間帶給 API 算；
 * 前端自行估算只在 API 失敗時當提示。
 */
describe('useWorkdayCalculator — 顯示後端 leave_hours（後端權威）', () => {
  const settle = async () => {
    await nextTick()
    await new Promise((r) => setTimeout(r, 350)) // useDebounceFn 300ms
    await flushPromises()
  }

  it('自訂時段：帶起訖時間呼叫 API，顯示回傳 leave_hours 而非前端自算', async () => {
    const form = reactive<Record<string, unknown>>({ employee_id: 1, start_date: '', end_date: '', leave_hours: 8 })
    const calls: unknown[][] = []
    const fetchFn = (...args: unknown[]) => {
      calls.push(args)
      // 前端自算 09:00–12:00＝3h；後端（班別 break 上限）說 2.5h → 以後端為準
      return Promise.resolve({
        data: {
          total_hours: 8,
          leave_hours: 2.5,
          breakdown: [{ date: '2026-10-07', type: 'workday', hours: 8, work_start: '08:00', work_end: '17:00' }],
        },
      })
    }
    const calc = useWorkdayCalculator({ form, fetchFn })
    calc.leaveMode.value = 'custom'
    await nextTick()
    form.start_date = '2026-10-07 09:00:00'
    form.end_date = '2026-10-07 12:00:00'
    await settle()

    expect(calls.at(-1)).toEqual(['2026-10-07', '2026-10-07', { start_time: '09:00', end_time: '12:00' }])
    expect(form.leave_hours).toBe(2.5)
    expect(calc.calcHint.value).toContain('2.5h')
  })

  it('全天：不帶時段，leave_hours＝後端回傳值（含 0，不抬成 0.5h）', async () => {
    const form = reactive<Record<string, unknown>>({ employee_id: 1, start_date: '', end_date: '', leave_hours: 8 })
    const calls: unknown[][] = []
    const fetchFn = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({
        data: { total_hours: 0, leave_hours: 0, breakdown: [{ date: '2026-10-10', type: 'weekend', hours: 0 }] },
      })
    }
    useWorkdayCalculator({ form, fetchFn })
    form.start_date = '2026-10-10'
    form.end_date = '2026-10-10'
    await settle()

    expect(calls.at(-1)).toEqual(['2026-10-10', '2026-10-10', {}])
    expect(form.leave_hours).toBe(0)
  })

  it('上午／下午：只帶 12:00 迄時／13:00 起時，顯示後端時數', async () => {
    const form = reactive<Record<string, unknown>>({ employee_id: 1, start_date: '', end_date: '', leave_hours: 8 })
    const calls: unknown[][] = []
    const fetchFn = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({
        data: {
          total_hours: 8.5,
          leave_hours: 5,
          breakdown: [{ date: '2026-10-07', type: 'workday', hours: 8.5, work_start: '07:00', work_end: '16:30' }],
        },
      })
    }
    const calc = useWorkdayCalculator({ form, fetchFn })
    calc.leaveMode.value = 'morning'
    await nextTick()
    calc.leaveSingleDate.value = '2026-10-07'
    await flushPromises()

    expect(calls.at(-1)).toEqual(['2026-10-07', '2026-10-07', { end_time: '12:00' }])
    expect(form.start_date).toBe('2026-10-07 07:00:00')
    expect(form.leave_hours).toBe(5)

    calc.leaveMode.value = 'afternoon'
    await nextTick()
    calc.leaveSingleDate.value = '2026-10-08'
    await flushPromises()
    expect(calls.at(-1)).toEqual(['2026-10-08', '2026-10-08', { start_time: '13:00' }])
  })

  it('API 失敗時前端估算只當提示（hint 標明以系統排班為準）', async () => {
    const form = reactive<Record<string, unknown>>({ employee_id: 1, start_date: '', end_date: '', leave_hours: 8 })
    const calc = useWorkdayCalculator({ form, fetchFn: () => Promise.reject(new Error('network down')) })
    form.start_date = '2026-10-07'
    form.end_date = '2026-10-07'
    await settle()

    expect(form.leave_hours).toBe(8)
    expect(calc.calcHint.value).toContain('送出時以系統排班重算')
  })
})
