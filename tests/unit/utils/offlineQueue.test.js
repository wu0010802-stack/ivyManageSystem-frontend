import { describe, it, expect, beforeEach } from 'vitest'
import {
    enqueueOp,
    listOps,
    getOp,
    removeOp,
    updateOp,
    countPending,
    listOtherUsersPendingOps,
    clearAll,
    OP_KINDS,
    OP_STATUS,
} from '@/utils/offlineQueue'

describe('offlineQueue', () => {
    beforeEach(async () => {
        await clearAll()
    })

    it('enqueueOp 應存入並產生 id / created_at / pending 狀態', async () => {
        const rec = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { date: '2026-04-19', classroom_id: 1, entries: [] },
            userId: 10,
            meta: { classroom_name: '大班' },
        })
        expect(rec.id).toBeTruthy()
        expect(rec.status).toBe(OP_STATUS.PENDING)
        expect(rec.attempts).toBe(0)
        expect(rec.created_at).toBeTruthy()

        const fetched = await getOp(rec.id)
        expect(fetched.payload.classroom_id).toBe(1)
        expect(fetched.meta.classroom_name).toBe('大班')
    })

    it('listOps 預設只回傳 pending 並依 created_at 排序', async () => {
        const a = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { seq: 1 },
            userId: 1,
        })
        await new Promise((r) => setTimeout(r, 5))
        const b = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { seq: 2 },
            userId: 1,
        })
        await updateOp(b.id, { status: OP_STATUS.NEEDS_REVIEW })

        const pending = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE })
        expect(pending).toHaveLength(1)
        expect(pending[0].id).toBe(a.id)

        const review = await listOps({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            status: OP_STATUS.NEEDS_REVIEW,
        })
        expect(review).toHaveLength(1)
        expect(review[0].id).toBe(b.id)
    })

    it('listOps 依 userId 過濾，避免跨老師看到彼此佇列', async () => {
        const a = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { seq: 1 },
            userId: 100,
        })
        await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { seq: 2 },
            userId: 200,
        })

        const forUser100 = await listOps({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            userId: 100,
        })
        expect(forUser100).toHaveLength(1)
        expect(forUser100[0].id).toBe(a.id)

        expect(await countPending(OP_KINDS.CLASS_ATTENDANCE, 100)).toBe(1)
        expect(await countPending(OP_KINDS.CLASS_ATTENDANCE, 200)).toBe(1)

        const others = await listOtherUsersPendingOps(100, OP_KINDS.CLASS_ATTENDANCE)
        expect(others).toHaveLength(1)
        expect(others[0].user_id).toBe(200)
    })

    it('enqueueOp 少傳 userId 應拋錯', async () => {
        await expect(
            enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: {} })
        ).rejects.toThrow(/userId/)
    })

    it('removeOp 應完全刪除該筆', async () => {
        const rec = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: {},
            userId: 1,
        })
        await removeOp(rec.id)
        expect(await getOp(rec.id)).toBeUndefined()
        expect(await countPending(OP_KINDS.CLASS_ATTENDANCE, 1)).toBe(0)
    })

    it('updateOp 應合併 patch，未指定欄位保留', async () => {
        const rec = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { a: 1 },
            userId: 1,
            meta: { classroom_name: '小班' },
        })
        const updated = await updateOp(rec.id, { attempts: 3, last_error: 'timeout' })
        expect(updated.attempts).toBe(3)
        expect(updated.last_error).toBe('timeout')
        expect(updated.payload.a).toBe(1)
        expect(updated.meta.classroom_name).toBe('小班')
        expect(updated.status).toBe(OP_STATUS.PENDING)
    })

    it('countPending 只算 pending 狀態', async () => {
        await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: {}, userId: 1 })
        const x = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: {},
            userId: 1,
        })
        await updateOp(x.id, { status: OP_STATUS.NEEDS_REVIEW })
        expect(await countPending(OP_KINDS.CLASS_ATTENDANCE, 1)).toBe(1)
    })
})
