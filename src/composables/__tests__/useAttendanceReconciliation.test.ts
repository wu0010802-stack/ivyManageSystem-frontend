import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import { useAttendanceReconciliation } from '../useAttendanceReconciliation'
const api = vi.hoisted(() => ({ preview: vi.fn(), confirm: vi.fn() }))
vi.mock('@/api/attendanceReconciliation', () => ({ previewReconciliation: api.preview, confirmReconciliationShift: api.confirm }))
const result = (name: string) => ({ data: { rows: [{ employee_name: name }], shift_types: [] } })
beforeEach(() => { vi.resetAllMocks() })
describe('出勤班表核對狀態', () => {
  it('只傳呼叫者明確提供的完整區間，不自行推定', async () => {
    api.preview.mockResolvedValue(result('甲'))
    const scope = effectScope()
    const state = scope.run(() => useAttendanceReconciliation())!
    await state.preview({ start_date: '2026-08-01', end_date: '2026-08-10' })
    expect(api.preview).toHaveBeenCalledWith({ start_date: '2026-08-01', end_date: '2026-08-10' })
    scope.stop()
  })
  it('晚回來的舊查詢不覆蓋新查詢', async () => {
    let finish!: (value: ReturnType<typeof result>) => void
    api.preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(result('新'))
    const scope = effectScope()
    const state = scope.run(() => useAttendanceReconciliation())!
    const first = state.preview({ start_date: '2026-08-01', end_date: '2026-08-02' })
    await state.preview({ start_date: '2026-08-03', end_date: '2026-08-04' })
    finish(result('舊'))
    await first
    expect(state.data.value?.rows[0].employee_name).toBe('新')
    scope.stop()
  })
  it('重新核對失敗後清除舊建議，顯示可重試錯誤', async () => {
    api.preview.mockResolvedValueOnce(result('甲')).mockRejectedValueOnce(new Error('網路中斷'))
    const scope = effectScope()
    const state = scope.run(() => useAttendanceReconciliation())!
    const body = { start_date: '2026-08-01', end_date: '2026-08-02' }
    await state.preview(body)
    await state.preview(body)
    expect(state.data.value).toBeNull()
    expect(state.error.value).toBeTruthy()
    expect(state.loading.value).toBe(false)
    scope.stop()
  })
  it('重設使在途回應失效', async () => {
    let finish!: (value: ReturnType<typeof result>) => void
    api.preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const scope = effectScope()
    const state = scope.run(() => useAttendanceReconciliation())!
    const pending = state.preview({ start_date: '2026-08-01', end_date: '2026-08-02' })
    state.reset()
    finish(result('舊'))
    await pending
    expect(state.data.value).toBeNull()
    scope.stop()
  })
})

describe('調班確認', () => {
  it('保存時拒絕重複送出，成功後清除舊版本', async () => {
    let finish!: (value: { data: { message: string; updated_count: number } }) => void
    api.confirm.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const scope = effectScope()
    const state = scope.run(() => useAttendanceReconciliation())!
    const body = { items: [{ employee_id: 1, date: '2026-08-03', shift_type_id: 2, day_off: false, version: 'v1' }], reason: '行政確認換班' }
    const pending = state.confirm(body)
    expect(await state.confirm(body)).toBe(false)
    expect(api.confirm).toHaveBeenCalledTimes(1)
    finish({ data: { message: '完成', updated_count: 1 } })
    expect(await pending).toBe(true)
    expect(state.data.value).toBeNull()
    scope.stop()
  })
  it('版本衝突清除建議並要求重新核對', async () => {
    api.preview.mockResolvedValue(result('甲'))
    api.confirm.mockRejectedValue({ response: { status: 409 } })
    const scope = effectScope()
    const state = scope.run(() => useAttendanceReconciliation())!
    await state.preview({ start_date: '2026-08-01', end_date: '2026-08-02' })
    expect(await state.confirm({ items: [{ employee_id: 1, date: '2026-08-01', shift_type_id: 2, day_off: false, version: 'v1' }], reason: '行政確認' })).toBe(false)
    expect(state.data.value).toBeNull()
    expect(state.error.value).toContain('重新核對')
    scope.stop()
  })
})
