import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushClassAttendanceQueue } from '@/utils/attendanceSync'
import {
    enqueueOp,
    listOps,
    clearAll,
    OP_KINDS,
    OP_STATUS,
} from '@/utils/offlineQueue'

function makeOp(meta = {}, userId = 1) {
    return enqueueOp({
        kind: OP_KINDS.CLASS_ATTENDANCE,
        payload: { date: '2026-04-19', classroom_id: 1, entries: [] },
        userId,
        meta,
    })
}

function httpError(status, detail) {
    const err = new Error('HTTP Error')
    err.response = { status, data: { detail } }
    return err
}

function networkError() {
    const err = new Error('Network Error')
    err.code = 'ERR_NETWORK'
    return err
}

describe('flushClassAttendanceQueue', () => {
    beforeEach(async () => {
        await clearAll()
    })

    it('成功時刪除佇列項並回傳 succeeded 數量', async () => {
        await makeOp({ classroom_name: 'A' })
        await makeOp({ classroom_name: 'B' })
        const saveFn = vi.fn().mockResolvedValue({ data: { saved: 0 } })

        const result = await flushClassAttendanceQueue(saveFn)

        expect(saveFn).toHaveBeenCalledTimes(2)
        expect(result.succeeded).toBe(2)
        expect(result.kept).toBe(0)
        const remain = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE })
        expect(remain).toHaveLength(0)
    })

    it('遇到 401 立即停止後續呼叫並保留整個佇列', async () => {
        await makeOp()
        await makeOp()
        await makeOp()
        const saveFn = vi.fn().mockRejectedValue(httpError(401, 'Unauthorized'))

        const result = await flushClassAttendanceQueue(saveFn)

        expect(saveFn).toHaveBeenCalledTimes(1)
        expect(result.auth_failed).toBe(true)
        expect(result.succeeded).toBe(0)
        // 第一筆被計為 kept，剩下兩筆也不被 flush
        expect(result.kept).toBe(3)
        const remain = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE })
        expect(remain).toHaveLength(3)
    })

    it('遇到 403 標為 needs_review 不重試', async () => {
        await makeOp({ classroom_name: 'A' })
        await makeOp({ classroom_name: 'B' })
        const saveFn = vi
            .fn()
            .mockRejectedValueOnce(httpError(403, '學生已轉班'))
            .mockResolvedValueOnce({ data: { saved: 0 } })

        const result = await flushClassAttendanceQueue(saveFn)

        expect(result.needs_review).toBe(1)
        expect(result.succeeded).toBe(1)
        const review = await listOps({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            status: OP_STATUS.NEEDS_REVIEW,
        })
        expect(review).toHaveLength(1)
        expect(review[0].last_error).toContain('學生已轉班')
    })

    it('網路錯誤時累計 attempts 但保留為 pending', async () => {
        const op = await makeOp()
        const saveFn = vi.fn().mockRejectedValue(networkError())

        const result = await flushClassAttendanceQueue(saveFn)

        expect(result.kept).toBe(1)
        expect(result.auth_failed).toBe(false)
        const pending = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE })
        expect(pending).toHaveLength(1)
        expect(pending[0].attempts).toBe(1)
        expect(pending[0].last_error).toContain('網路')
        expect(pending[0].id).toBe(op.id)
    })

    it('其他錯誤累計滿 5 次升級為 needs_review', async () => {
        const op = await makeOp()
        // 預先把 attempts 堆到 4
        const { updateOp } = await import('@/utils/offlineQueue')
        await updateOp(op.id, { attempts: 4 })
        const saveFn = vi.fn().mockRejectedValue(httpError(500, 'Server Error'))

        const result = await flushClassAttendanceQueue(saveFn)

        expect(result.needs_review).toBe(1)
        const review = await listOps({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            status: OP_STATUS.NEEDS_REVIEW,
        })
        expect(review).toHaveLength(1)
        expect(review[0].attempts).toBe(5)
    })

    it('userId 過濾：只 flush 當前使用者的佇列，不碰他人', async () => {
        await makeOp({ classroom_name: 'A' }, 100)
        await makeOp({ classroom_name: 'B' }, 200)
        const saveFn = vi.fn().mockResolvedValue({ data: { saved: 0 } })

        const result = await flushClassAttendanceQueue(saveFn, { userId: 100 })

        expect(saveFn).toHaveBeenCalledTimes(1)
        expect(result.succeeded).toBe(1)
        // 老師 200 的佇列不動
        const remain = await listOps({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            status: OP_STATUS.PENDING,
        })
        expect(remain).toHaveLength(1)
        expect(remain[0].user_id).toBe(200)
    })
})
