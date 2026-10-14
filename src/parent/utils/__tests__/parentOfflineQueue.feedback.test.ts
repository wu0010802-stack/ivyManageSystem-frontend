/**
 * 離線佇列回饋：背景補送成功依 kind 跳中文 toast、通知訂閱者；登出 flush 不跳；
 * kind 中文名稱、內容摘要、錯誤原因轉白話；逐筆列出／重試／捨棄。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import 'fake-indexeddb/auto'

vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: vi.fn(),
}))
const createLeave = vi.fn()
vi.mock('@/parent/api/leaves', () => ({ createLeave: (...a: unknown[]) => createLeave(...a) }))
const toastSuccess = vi.fn()
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  _resetParentQueueFeedbackForTests,
  describeParentOp,
  discardParentOp,
  enqueueParent,
  flushParentQueue,
  friendlyOpError,
  listParentQueued,
  onParentQueueChange,
  PARENT_KIND_LABEL,
  PARENT_KINDS,
  retryParentOp,
  syncedMessage,
} from '../parentOfflineQueue'
import { OP_KINDS, OP_STATUS, clearAll, updateOp } from '@/utils/offlineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'

function loginAs(userId: number) {
  vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: userId } } as ReturnType<typeof useParentAuthStore>)
}

function leavePayload() {
  return { student_id: 3, leave_type: '病假', start_date: '2026-10-14', end_date: '2026-10-14', reason: null }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearAll()
  vi.resetAllMocks()
  toastSuccess.mockReset()
  _resetParentQueueFeedbackForTests()
})

describe('回饋文案', () => {
  it('每個 kind 都有中文名稱，且不含底線代碼', () => {
    for (const kind of PARENT_KINDS) {
      expect(PARENT_KIND_LABEL[kind]).toBeTruthy()
      expect(PARENT_KIND_LABEL[kind]).not.toMatch(/_/)
    }
  })

  it('syncedMessage：單一 kind、多筆、多 kind、零筆', () => {
    expect(syncedMessage({ [OP_KINDS.PARENT_LEAVE_REQUEST]: 1 })).toBe('請假已送出')
    expect(syncedMessage({ [OP_KINDS.PARENT_LEAVE_REQUEST]: 2 })).toBe('請假已送出（2 筆）')
    expect(syncedMessage({ [OP_KINDS.PARENT_LEAVE_REQUEST]: 1, [OP_KINDS.EVENT_ACK]: 1 }))
      .toBe('離線暫存的事件簽閱、請假申請已送出')
    expect(syncedMessage({ [OP_KINDS.EVENT_ACK]: 0 })).toBeNull()
  })

  it('friendlyOpError：英文／代碼轉白話，後端中文 detail 原樣', () => {
    expect(friendlyOpError('forbidden')).toContain('沒有權限')
    expect(friendlyOpError('Request failed with status code 500')).toBe('園所系統暫時無法處理')
    expect(friendlyOpError({ code: 'LEAVE_OVERLAP', message: '這段期間已有請假' })).toBe('這段期間已有請假')
    expect(friendlyOpError('這段期間已有請假')).toBe('這段期間已有請假')
    expect(friendlyOpError(null)).toBe('原因不明')
  })

  it('describeParentOp：請假顯示假別與日期，事件簽閱顯示標題', () => {
    expect(describeParentOp({
      kind: OP_KINDS.PARENT_LEAVE_REQUEST,
      payload: { leave_type: '事假', start_date: '2026-10-14', end_date: '2026-10-16' },
    })).toBe('事假 2026-10-14～2026-10-16')
    expect(describeParentOp({ kind: OP_KINDS.EVENT_ACK, payload: {}, meta: { title: '校外教學' } })).toBe('校外教學')
    expect(describeParentOp({ kind: OP_KINDS.CONTACT_BOOK_ACK, payload: {}, meta: {} })).toBe('')
  })
})

describe('flush 回饋', () => {
  it('背景補送成功 → 依 kind 跳中文 toast，並通知訂閱者', async () => {
    loginAs(7)
    const listener = vi.fn()
    const off = onParentQueueChange(listener)
    await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })

    const result = await flushParentQueue(OP_KINDS.PARENT_LEAVE_REQUEST, vi.fn().mockResolvedValue({}))
    off()

    expect(result.succeeded).toBe(1)
    expect(toastSuccess).toHaveBeenCalledWith('請假已送出')
    expect(listener).toHaveBeenCalledWith({ succeededByKind: { [OP_KINDS.PARENT_LEAVE_REQUEST]: 1 } })
  })

  it('沒有成功（仍離線）不跳 toast', async () => {
    loginAs(7)
    await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })
    const networkErr = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
    await flushParentQueue(OP_KINDS.PARENT_LEAVE_REQUEST, vi.fn().mockRejectedValue(networkErr))
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('同一句回饋短時間內不重複跳（頁面 flush 與全域 flush 同時成功）', async () => {
    loginAs(7)
    await enqueueParent({ kind: OP_KINDS.EVENT_ACK, payload: { event_id: 1, student_id: 3 } })
    await flushParentQueue(OP_KINDS.EVENT_ACK, vi.fn().mockResolvedValue({}))
    await enqueueParent({ kind: OP_KINDS.EVENT_ACK, payload: { event_id: 2, student_id: 3 } })
    await flushParentQueue(OP_KINDS.EVENT_ACK, vi.fn().mockResolvedValue({}))
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('逐筆處理', () => {
  it('listParentQueued 只列目前家長的待送出＋無法同步', async () => {
    loginAs(7)
    const a = await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })
    const b = await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })
    await updateOp(b.id, { status: OP_STATUS.NEEDS_REVIEW })
    loginAs(8)
    await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })

    loginAs(7)
    const ops = await listParentQueued(OP_KINDS.PARENT_LEAVE_REQUEST)
    expect(ops.map((o) => o.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('retryParentOp：放回待送出就通知訂閱者，這次又遇到可重試錯誤也不會留著「無法送出」', async () => {
    loginAs(7)
    const op = await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })
    await updateOp(op.id, { status: OP_STATUS.NEEDS_REVIEW })
    createLeave.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
    const listener = vi.fn()
    const off = onParentQueueChange(listener)

    const result = await retryParentOp({ id: op.id, kind: OP_KINDS.PARENT_LEAVE_REQUEST })
    off()

    expect(result.succeeded).toBe(0)
    expect(result.needs_review).toBe(0)
    // 請假列表的佔位卡只靠這個通知更新：狀態已從「無法同步」變回「待送出」
    expect(listener).toHaveBeenCalledWith({ succeededByKind: {} })
    const ops = await listParentQueued(OP_KINDS.PARENT_LEAVE_REQUEST)
    expect(ops.map((o) => o.status)).toEqual([OP_STATUS.PENDING])
  })

  it('discardParentOp 刪除該筆並通知訂閱者', async () => {
    loginAs(7)
    const op = await enqueueParent({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, payload: leavePayload() })
    const listener = vi.fn()
    const off = onParentQueueChange(listener)
    await discardParentOp(op.id)
    off()
    expect(await listParentQueued(OP_KINDS.PARENT_LEAVE_REQUEST)).toEqual([])
    expect(listener).toHaveBeenCalledWith({ succeededByKind: {} })
  })
})
