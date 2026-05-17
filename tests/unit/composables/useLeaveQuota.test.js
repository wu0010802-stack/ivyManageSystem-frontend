import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive, nextTick } from 'vue'
import { useLeaveQuota } from '@/composables/useLeaveQuota'

// 重要：useDebounceFn 是 300ms debounce，測試用 fake timer 推進
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function makeFetch(info) {
  return vi.fn().mockResolvedValue(info)
}

describe('useLeaveQuota', () => {
  it('初始 leave_type 不在 QUOTA_TYPES 時不 fetch', async () => {
    const fetchFn = makeFetch({ remaining_hours: 10 })
    const form = reactive({ employee_id: 1, leave_type: 'official', start_date: '2026-05-01', leave_hours: 4 })
    const { quotaInfo } = useLeaveQuota({ form, fetchFn })
    // 微任務 flush
    await Promise.resolve()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(quotaInfo.value).toBe(null)
  })

  it('初始 leave_type 在 QUOTA_TYPES 時立即 fetch', async () => {
    const fetchFn = makeFetch({ remaining_hours: 10, used_hours: 0 })
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 4 })
    const { quotaInfo } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('annual', 2026)
    expect(quotaInfo.value).toEqual({ remaining_hours: 10, used_hours: 0 })
  })

  it('quotaExceeded：leave_hours > remaining → true', async () => {
    const fetchFn = makeFetch({ remaining_hours: 4 })
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 8 })
    const { quotaExceeded } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(quotaExceeded.value).toBe(true)
  })

  it('quotaExceeded：leave_hours <= remaining → false', async () => {
    const fetchFn = makeFetch({ remaining_hours: 10 })
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 8 })
    const { quotaExceeded } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(quotaExceeded.value).toBe(false)
  })

  it('editBaseline：把本筆原本時數加回剩餘額度', async () => {
    const fetchFn = makeFetch({ remaining_hours: 2 })
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 5 })
    const { quotaExceeded, setEditBaseline, clearEditBaseline } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(quotaExceeded.value).toBe(true) // 5 > 2

    setEditBaseline(4) // 視為實際可用 = 2 + 4 = 6
    expect(quotaExceeded.value).toBe(false)

    clearEditBaseline()
    expect(quotaExceeded.value).toBe(true)
  })

  it('quotaInfo=null 時 quotaExceeded 為 false', async () => {
    const fetchFn = makeFetch(null)
    const form = reactive({ employee_id: 1, leave_type: 'official', start_date: '2026-05-01', leave_hours: 100 })
    const { quotaExceeded } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    expect(quotaExceeded.value).toBe(false)
  })

  it('fetchFn throw 時 quotaInfo 設為 null', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'))
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 4 })
    const { quotaInfo, quotaLoading } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(quotaInfo.value).toBe(null)
    expect(quotaLoading.value).toBe(false)
  })

  it('改 leave_type 觸發 debounced fetch', async () => {
    const fetchFn = makeFetch({ remaining_hours: 8 })
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 4 })
    useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    form.leave_type = 'sick'
    await nextTick()
    // debounce 還沒到
    expect(fetchFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(350)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn).toHaveBeenLastCalledWith('sick', 2026)
  })

  it('resolveYear：start_date 提供年份時用該年；空時用當前年', async () => {
    const fetchFn = makeFetch({ remaining_hours: 1 })
    const form = reactive({ employee_id: 1, leave_type: 'annual', start_date: '2024-03-15', leave_hours: 1 })
    useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchFn).toHaveBeenCalledWith('annual', 2024)
  })

  it('沒 employee_id 時不 fetch', async () => {
    const fetchFn = makeFetch({ remaining_hours: 1 })
    const form = reactive({ employee_id: null, leave_type: 'annual', start_date: '2026-05-01', leave_hours: 4 })
    const { quotaInfo } = useLeaveQuota({ form, fetchFn })
    await Promise.resolve()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(quotaInfo.value).toBe(null)
  })
})
