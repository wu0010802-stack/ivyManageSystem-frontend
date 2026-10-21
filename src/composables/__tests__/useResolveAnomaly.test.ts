import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useResolveAnomaly } from '../useResolveAnomaly'

const api = vi.hoisted(() => ({ upsertRecord: vi.fn(), batchConfirmAnomalies: vi.fn() }))
const ui = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), notify: vi.fn() }))
vi.mock('@/api/attendance', () => ({ upsertRecord: api.upsertRecord, batchConfirmAnomalies: api.batchConfirmAnomalies }))
vi.mock('element-plus', () => ({ ElMessage: { success: ui.success, warning: ui.warning } }))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: ui.notify }) }))

beforeEach(() => {
  vi.resetAllMocks()
  api.upsertRecord.mockResolvedValue({ data: {} })
  api.batchConfirmAnomalies.mockResolvedValue({ data: {} })
})

describe('useResolveAnomaly（出勤明細與排班抽屜共用的補卡／接受扣款／豁免送出）', () => {
  const target = { employeeId: 7, date: '2026-09-16', attendanceId: 55 }

  it('補打卡：整列覆寫，帶既有值＋補填值', async () => {
    const done = vi.fn()
    const { resolve } = useResolveAnomaly(done, 'test')
    expect(await resolve(target, { action: 'punch', punch_in: '07:52', punch_out: '17:00' })).toBe(true)
    expect(api.upsertRecord).toHaveBeenCalledWith({ employee_id: 7, date: '2026-09-16', punch_in: '07:52', punch_out: '17:00' })
    expect(done).toHaveBeenCalledTimes(1)
    // 提示寫出做了什麼（只寫「已處理」看不出是扣了還是豁免了）
    expect(ui.success).toHaveBeenCalledWith('已補打卡並重新計算')
  })

  it('成功提示依動作寫出結果；呼叫端可指定（整天只有缺卡＝已確認缺卡）', async () => {
    const { resolve } = useResolveAnomaly(vi.fn(), 'test')
    await resolve(target, { action: 'admin_waive' })
    expect(ui.success).toHaveBeenLastCalledWith('已豁免')
    await resolve(target, { action: 'admin_accept' })
    expect(ui.success).toHaveBeenLastCalledWith('已接受扣款')
    await resolve(target, { action: 'admin_accept', doneText: '已確認缺卡' })
    expect(ui.success).toHaveBeenLastCalledWith('已確認缺卡')
  })

  it('接受扣款／豁免：以出勤紀錄 id 批次確認', async () => {
    const { resolve } = useResolveAnomaly(vi.fn(), 'test')
    await resolve(target, { action: 'admin_waive' })
    expect(api.batchConfirmAnomalies).toHaveBeenCalledWith({ attendance_ids: [55], action: 'admin_waive' })
  })

  it('找不到員工或出勤紀錄：提示且不送；送出中不重複送；失敗通知且不呼叫完成', async () => {
    const done = vi.fn()
    const { resolve, resolving } = useResolveAnomaly(done, 'test')
    expect(await resolve({ ...target, employeeId: null }, { action: 'punch', punch_in: '08:00' })).toBe(false)
    expect(await resolve({ ...target, attendanceId: null }, { action: 'admin_accept' })).toBe(false)
    expect(ui.warning).toHaveBeenCalledTimes(2)
    let release: () => void = () => {}
    api.upsertRecord.mockReturnValueOnce(new Promise((r) => { release = () => r({ data: {} }) }))
    const first = resolve(target, { action: 'punch', punch_in: '08:00' })
    expect(resolving.value).toBe(true)
    expect(await resolve(target, { action: 'punch', punch_in: '08:00' })).toBe(false)
    release()
    await first
    api.batchConfirmAnomalies.mockRejectedValueOnce(new Error('x'))
    expect(await resolve(target, { action: 'admin_accept' })).toBe(false)
    expect(ui.notify).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
  })
})
