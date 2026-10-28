import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushClassAttendanceQueue, discardSupersededClassAttendanceOps } from '@/utils/attendanceSync'
import { enqueueOp, listOps, clearAll, updateOp, OP_KINDS, OP_STATUS } from '@/utils/offlineQueue'

type Entry = { student_id: number; status: string; remark?: string }

function payload(entries: Entry[], date = '2026-10-28', classroom_id = 7) {
    return { date, classroom_id, entries }
}

async function enqueue(p: ReturnType<typeof payload>) {
    const op = await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: p, userId: 1 })
    // 確保 created_at 嚴格遞增（同毫秒入列時排序不穩）
    await new Promise((r) => setTimeout(r, 2))
    return op
}

describe('點名佇列：較舊 op 不得蓋掉較新儲存', () => {
    beforeEach(async () => {
        await clearAll()
    })

    it('線上儲存成功後，同班同日佇列中已儲存學生的舊狀態被剔除，不會再補送', async () => {
        // ① 網路失敗入列：小明(1)=缺席、小華(2)=出席
        await enqueue(payload([
            { student_id: 1, status: '缺席' },
            { student_id: 2, status: '出席' },
        ]))
        // ② 線上儲存成功：小明=出席、小華=出席
        const saved = payload([
            { student_id: 1, status: '出席' },
            { student_id: 2, status: '出席' },
        ])
        await discardSupersededClassAttendanceOps(saved, { userId: 1 })

        const saveFn = vi.fn().mockResolvedValue({})
        await flushClassAttendanceQueue(saveFn, { userId: 1 })

        expect(saveFn).not.toHaveBeenCalled()
        expect(await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, userId: 1 })).toHaveLength(0)
    })

    it('只剔除已儲存的學生；其他班／其他日的 op 原封保留', async () => {
        await enqueue(payload([
            { student_id: 1, status: '缺席' },
            { student_id: 3, status: '病假' },
        ]))
        await enqueue(payload([{ student_id: 1, status: '缺席' }], '2026-10-27'))
        await enqueue(payload([{ student_id: 1, status: '缺席' }], '2026-10-28', 8))

        await discardSupersededClassAttendanceOps(payload([{ student_id: 1, status: '出席' }]), { userId: 1 })

        const saveFn = vi.fn().mockResolvedValue({})
        await flushClassAttendanceQueue(saveFn, { userId: 1 })
        const sent = saveFn.mock.calls.map((c) => c[0])
        expect(sent).toEqual([
            payload([{ student_id: 3, status: '病假' }]),
            payload([{ student_id: 1, status: '缺席' }], '2026-10-27'),
            payload([{ student_id: 1, status: '缺席' }], '2026-10-28', 8),
        ])
    })

    it('needs_review 的舊 op 也剔除（之後手動重試不得蓋回）', async () => {
        const op = await enqueue(payload([{ student_id: 1, status: '缺席' }]))
        await updateOp(op.id, { status: OP_STATUS.NEEDS_REVIEW })
        await discardSupersededClassAttendanceOps(payload([{ student_id: 1, status: '出席' }]), { userId: 1 })
        expect(await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, status: null, userId: 1 })).toHaveLength(0)
    })

    it('佇列內同班同日兩筆：flush 只送較新的狀態，較舊 op 不得最後寫入', async () => {
        await enqueue(payload([{ student_id: 1, status: '缺席' }]))
        await enqueue(payload([{ student_id: 1, status: '出席' }]))

        const saveFn = vi.fn().mockResolvedValue({})
        const result = await flushClassAttendanceQueue(saveFn, { userId: 1 })

        expect(saveFn).toHaveBeenCalledTimes(1)
        expect(saveFn).toHaveBeenCalledWith(payload([{ student_id: 1, status: '出席' }]))
        expect(result.succeeded).toBe(1)
        expect(await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, userId: 1 })).toHaveLength(0)
    })
})
