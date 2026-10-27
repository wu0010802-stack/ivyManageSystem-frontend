import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useResolveAnomaly } from '../useResolveAnomaly'

const api = vi.hoisted(() => ({ upsertRecord: vi.fn(), batchConfirmAnomalies: vi.fn() }))
const ui = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), notify: vi.fn(), undoToast: vi.fn() }))
vi.mock('@/api/attendance', () => ({ upsertRecord: api.upsertRecord, batchConfirmAnomalies: api.batchConfirmAnomalies }))
vi.mock('element-plus', () => ({ ElMessage: { success: ui.success, warning: ui.warning } }))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: ui.notify }) }))
// 只換掉會真的跳訊息的 showUndoToast；「給不給復原」的判斷（confirmedFollowUp）用真的
vi.mock('@/composables/useConfirmUndo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useConfirmUndo')>()),
  showUndoToast: ui.undoToast,
}))

beforeEach(() => {
  vi.resetAllMocks()
  api.upsertRecord.mockResolvedValue({ data: {} })
  // 後端回應：這筆由未確認改成已處理，所以可復原
  api.batchConfirmAnomalies.mockResolvedValue({ data: { processed: 1, undoable_ids: [55] } })
})

describe('useResolveAnomaly（出勤明細與排班抽屜共用的補卡／接受扣款／豁免送出）', () => {
  const target = { employeeId: 7, date: '2026-09-16', attendanceId: 55 }

  it('補打卡：整列覆寫，帶既有值＋補填值；補打卡沒有復原，照舊用一般成功提示', async () => {
    const done = vi.fn()
    const { resolve } = useResolveAnomaly(done, 'test')
    expect(await resolve(target, { action: 'punch', punch_in: '07:52', punch_out: '17:00' })).toBe(true)
    expect(api.upsertRecord).toHaveBeenCalledWith({ employee_id: 7, date: '2026-09-16', punch_in: '07:52', punch_out: '17:00' })
    expect(done).toHaveBeenCalledTimes(1)
    // 提示寫出做了什麼（只寫「已處理」看不出是扣了還是豁免了）
    expect(ui.success).toHaveBeenCalledWith('已補打卡並重新計算')
    expect(ui.undoToast).not.toHaveBeenCalled()
  })

  it('接受扣款／豁免成功：跳可復原的提示（帶這筆出勤紀錄 id），不另外跳一般成功提示', async () => {
    const { resolve } = useResolveAnomaly(vi.fn(), 'test')
    await resolve(target, { action: 'admin_waive', remark: '打卡機故障' })
    expect(ui.undoToast).toHaveBeenLastCalledWith({ text: '已豁免', attendanceIds: [55], onUndone: expect.any(Function) })
    await resolve(target, { action: 'admin_accept' })
    expect(ui.undoToast).toHaveBeenLastCalledWith(expect.objectContaining({ text: '已接受扣款', attendanceIds: [55] }))
    // 呼叫端可指定提示文字（整天只有缺卡＝已確認缺卡；抽屜寫出處理了誰哪天）
    await resolve(target, { action: 'admin_accept', doneText: '已確認缺卡' })
    expect(ui.undoToast).toHaveBeenLastCalledWith(expect.objectContaining({ text: '已確認缺卡' }))
    expect(ui.success).not.toHaveBeenCalled()
  })

  it('按了復原：呼叫呼叫端給的 onUndone；沒給就用 onDone 重抓', async () => {
    const done = vi.fn()
    const undone = vi.fn()
    const withUndo = useResolveAnomaly(done, 'test', { onUndone: undone })
    await withUndo.resolve(target, { action: 'admin_accept' })
    const { onUndone } = ui.undoToast.mock.calls[0][0] as { onUndone: () => void }
    onUndone()
    expect(undone).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1) // 只有處理成功那一次

    const fallback = vi.fn()
    const plain = useResolveAnomaly(fallback, 'test')
    await plain.resolve(target, { action: 'admin_waive', remark: '園長同意' })
    ;(ui.undoToast.mock.calls[1][0] as { onUndone: () => void }).onUndone()
    expect(fallback).toHaveBeenCalledTimes(2)
  })

  it('完成回呼拿得到這次的動作與有沒有跳出復原提示（抽屜據此決定要不要另外提示下一件）', async () => {
    const done = vi.fn()
    const { resolve } = useResolveAnomaly(done, 'test')
    await resolve(target, { action: 'admin_waive', remark: '園方指派外出' })
    expect(done).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'admin_waive' }), { undoToast: true })
    await resolve(target, { action: 'punch', punch_in: '08:00' })
    expect(done).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'punch' }), { undoToast: false })
  })

  describe('復原只看後端回的 undoable_ids（R48）', () => {
    it('undoable_ids 少於 processed（這筆原本已有處理，被覆蓋）：不跳復原，一般成功訊息說明無法復原；回呼 undoToast=false', async () => {
      api.batchConfirmAnomalies.mockResolvedValue({ data: { processed: 1, undoable_ids: [] } })
      const done = vi.fn()
      const { resolve } = useResolveAnomaly(done, 'test')
      expect(await resolve(target, { action: 'admin_accept', doneText: '已處理 9/16（三）林班導' })).toBe(true)
      expect(ui.undoToast).not.toHaveBeenCalled()
      expect(ui.success).toHaveBeenCalledWith('已處理 9/16（三）林班導。其中 1 件原本已有處理，無法復原')
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_accept' }), { undoToast: false })
    })

    it('沒帶 undoable_ids 也當成不能復原，不拿前端的猜測補', async () => {
      api.batchConfirmAnomalies.mockResolvedValue({ data: { processed: 1 } })
      const { resolve } = useResolveAnomaly(vi.fn(), 'test')
      await resolve(target, { action: 'admin_waive', remark: '園長同意' })
      expect(ui.undoToast).not.toHaveBeenCalled()
      expect(ui.success).toHaveBeenCalledWith('已豁免。其中 1 件原本已有處理，無法復原')
    })

    it('processed=0（這筆紀錄已不存在或已變更）：顯示警告、不顯示成功、不跳復原；仍呼叫完成回呼讓畫面重抓', async () => {
      api.batchConfirmAnomalies.mockResolvedValue({ data: { processed: 0, undoable_ids: [] } })
      const done = vi.fn()
      const { resolve } = useResolveAnomaly(done, 'test')
      await resolve(target, { action: 'admin_accept', doneText: '已處理 9/16（三）林班導，跳到下一件' })
      expect(ui.success).not.toHaveBeenCalled()
      expect(ui.undoToast).not.toHaveBeenCalled()
      expect(ui.warning).toHaveBeenCalledWith('這筆紀錄已不存在或已變更，請重新整理')
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_accept' }), { undoToast: false })
    })

    it('全部可復原：復原送出的是後端回的 undoable_ids', async () => {
      api.batchConfirmAnomalies.mockResolvedValue({ data: { processed: 1, undoable_ids: [901] } })
      const { resolve } = useResolveAnomaly(vi.fn(), 'test')
      await resolve(target, { action: 'admin_accept' })
      expect(ui.undoToast).toHaveBeenCalledWith({ text: '已接受扣款', attendanceIds: [901], onUndone: expect.any(Function) })
      expect(ui.success).not.toHaveBeenCalled()
    })
  })

  it('接受扣款／豁免：以出勤紀錄 id 批次確認；豁免理由一併送出', async () => {
    const { resolve } = useResolveAnomaly(vi.fn(), 'test')
    await resolve(target, { action: 'admin_waive', remark: '園長同意晚到' })
    expect(api.batchConfirmAnomalies).toHaveBeenCalledWith({ attendance_ids: [55], action: 'admin_waive', remark: '園長同意晚到' })
    await resolve(target, { action: 'admin_accept' })
    expect(api.batchConfirmAnomalies).toHaveBeenLastCalledWith({ attendance_ids: [55], action: 'admin_accept' })
  })

  it('找不到員工或出勤紀錄：提示且不送；送出中不重複送；失敗通知且不呼叫完成、不跳復原', async () => {
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
    expect(ui.undoToast).not.toHaveBeenCalled()
  })
})
