/**
 * 教師端請假表單的配額區塊完全不會渲染，前端額度守衛等於關閉（bug-hunt 2026-07-27）。
 *
 * useLeaveQuota.fetchQuotaInfo 的第一道守衛要求 `form.employee_id`，但教師端的
 * PortalLeaveForm 表單根本沒有這個欄位（老師只能幫自己請假，身分從 token 取），
 * 於是每次都 early return，同函式下方為 portal 準備的 `fetchFn`（getMyQuotas）分支
 * 永遠走不到——Network 從頭到尾看不到 GET /api/portal/my-quotas，後端端點功能完好
 * 但零 caller。
 *
 * 症狀：老師選特休／病假／事假等有配額的假別，永遠看不到「剩餘 Xh／已用 Xh／待審 Xh」、
 * 看不到「本次申請後剩餘」、也不會出現「配額不足，無法送出」的紅色 alert，
 * 送出鈕永遠可按，超用只能等後端 400 才知道。
 *
 * 對照組 useWorkdayCalculator 有 `if (empId || fetchFn)` 的 portal 逃生門，這支漏掉。
 * 註：後端 api/portal/leaves.py 的 _guard_leave_quota 仍會擋超額，沒有資料破口，
 * 純粹是前端守衛失效。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive, nextTick } from 'vue'

vi.mock('@/api/leaves', () => ({
  getLeaveQuotas: vi.fn().mockResolvedValue({ data: [] }),
}))

import { getLeaveQuotas } from '@/api/leaves'
import { useLeaveQuota } from '@/composables/useLeaveQuota'

/** 教師端表單形狀：沒有 employee_id */
function portalForm() {
  return reactive({
    leave_type: 'annual',
    start_date: '2026-07-15',
    end_date: '2026-07-15',
    leave_hours: 8,
  }) as unknown as Record<string, unknown>
}

describe('useLeaveQuota 在教師端（無 employee_id、有 fetchFn）', () => {
  beforeEach(() => {
    vi.mocked(getLeaveQuotas).mockClear()
  })

  it('沒有 employee_id 但有 fetchFn 時，仍必須去查配額', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ remaining_hours: 16 })

    useLeaveQuota({ form: portalForm(), fetchFn })
    await nextTick()

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('annual', 2026)
  })

  it('查到配額後 quotaExceeded 才有辦法擋住超用', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ remaining_hours: 4 })
    const form = portalForm()
    form.leave_hours = 8

    const { quotaInfo, quotaExceeded } = useLeaveQuota({ form, fetchFn })
    await vi.waitFor(() => expect(quotaInfo.value).not.toBeNull())

    expect(quotaExceeded.value).toBe(true)
  })

  it('管理端（有 employee_id、無 fetchFn）行為不變，仍走 getLeaveQuotas', async () => {
    const form = portalForm()
    form.employee_id = 5

    useLeaveQuota({ form })
    await nextTick()

    expect(getLeaveQuotas).toHaveBeenCalledTimes(1)
  })

  it('兩者皆無時仍應 early return，不打任何 API', async () => {
    useLeaveQuota({ form: portalForm() })
    await nextTick()

    expect(getLeaveQuotas).not.toHaveBeenCalled()
  })
})
