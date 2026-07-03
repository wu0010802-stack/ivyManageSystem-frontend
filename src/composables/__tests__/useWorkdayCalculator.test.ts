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
