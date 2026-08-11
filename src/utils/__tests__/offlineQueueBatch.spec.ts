/**
 * listOpsForKinds：合併多 kind×status 查詢為單次 getAll() 的批次讀取。
 * 過濾語意（userId 必填、租戶 fail-open、排序）須與既有 listOps 逐一對齊。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

const tenantState = vi.hoisted(() => ({ slug: null as string | null }))
vi.mock('@/utils/tenant', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/tenant')>()
    return { ...actual, tenantSlug: () => tenantState.slug }
})
vi.mock('@/utils/sentry', () => ({
    captureException: vi.fn(() => Promise.resolve()),
}))

import {
    enqueueOp,
    listOpsForKinds,
    updateOp,
    clearAll,
    OP_KINDS,
    OP_STATUS,
} from '@/utils/offlineQueue'
import { captureException } from '@/utils/sentry'

describe('listOpsForKinds', () => {
    beforeEach(async () => {
        tenantState.slug = null
        await clearAll()
        vi.mocked(captureException).mockClear()
    })

    it('底層只呼叫一次原生 IDBObjectStore.getAll，無論查幾個 kind', async () => {
        for (const kind of [OP_KINDS.PARENT_MESSAGE, OP_KINDS.CONTACT_BOOK_REPLY]) {
            await enqueueOp({ kind, payload: { x: 1 }, userId: 7 })
        }
        const dbSpy = vi.spyOn(globalThis.IDBObjectStore.prototype, 'getAll')

        await listOpsForKinds({
            kinds: [
                OP_KINDS.PARENT_MESSAGE,
                OP_KINDS.CONTACT_BOOK_REPLY,
                OP_KINDS.CONTACT_BOOK_ACK,
                OP_KINDS.EVENT_ACK,
                OP_KINDS.PARENT_LEAVE_REQUEST,
            ],
            userId: 7,
        })

        expect(dbSpy).toHaveBeenCalledTimes(1)
        dbSpy.mockRestore()
    })

    it('依 kind 分組回傳 pending / needs_review，其餘 kind 回空陣列', async () => {
        const op1 = await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { x: 1 }, userId: 7 })
        await enqueueOp({ kind: OP_KINDS.CONTACT_BOOK_REPLY, payload: { x: 2 }, userId: 7 })
        await updateOp(op1.id, { status: OP_STATUS.NEEDS_REVIEW })

        const result = await listOpsForKinds({
            kinds: [OP_KINDS.PARENT_MESSAGE, OP_KINDS.CONTACT_BOOK_REPLY, OP_KINDS.EVENT_ACK],
            userId: 7,
        })

        expect(result[OP_KINDS.PARENT_MESSAGE].pending).toHaveLength(0)
        expect(result[OP_KINDS.PARENT_MESSAGE].needs_review).toHaveLength(1)
        expect(result[OP_KINDS.CONTACT_BOOK_REPLY].pending).toHaveLength(1)
        expect(result[OP_KINDS.CONTACT_BOOK_REPLY].needs_review).toHaveLength(0)
        expect(result[OP_KINDS.EVENT_ACK]).toEqual({ pending: [], needs_review: [] })
    })

    it('只回傳指定 userId 的記錄（共享裝置隔離，與 listOps 語意一致）', async () => {
        await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { x: 1 }, userId: 7 })
        await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { x: 2 }, userId: 8 })

        const result = await listOpsForKinds({ kinds: [OP_KINDS.PARENT_MESSAGE], userId: 7 })

        expect(result[OP_KINDS.PARENT_MESSAGE].pending).toHaveLength(1)
        expect(result[OP_KINDS.PARENT_MESSAGE].pending[0].user_id).toBe(7)
    })

    it('userId 缺失時 fail-closed，全部回空', async () => {
        await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { x: 1 }, userId: 7 })

        const result = await listOpsForKinds({ kinds: [OP_KINDS.PARENT_MESSAGE], userId: null })

        expect(result[OP_KINDS.PARENT_MESSAGE]).toEqual({ pending: [], needs_review: [] })
    })

    it('多租戶模式：租戶過濾 fail-open 且與 listOps 一致（缺 tenant_slug 舊記錄放行、跨租戶濾除）', async () => {
        tenantState.slug = 'alpha'
        const mine = await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { x: 1 }, userId: 7 })
        tenantState.slug = 'beta'
        await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { x: 2 }, userId: 7 })

        tenantState.slug = 'alpha'
        const result = await listOpsForKinds({ kinds: [OP_KINDS.PARENT_MESSAGE], userId: 7 })

        expect(result[OP_KINDS.PARENT_MESSAGE].pending).toHaveLength(1)
        expect(result[OP_KINDS.PARENT_MESSAGE].pending[0].id).toBe(mine.id)
    })

    it('依 created_at 排序（與 listOps 一致）', async () => {
        await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { seq: 1 }, userId: 7 })
        await new Promise((r) => setTimeout(r, 5))
        await enqueueOp({ kind: OP_KINDS.PARENT_MESSAGE, payload: { seq: 2 }, userId: 7 })

        const result = await listOpsForKinds({ kinds: [OP_KINDS.PARENT_MESSAGE], userId: 7 })

        expect(result[OP_KINDS.PARENT_MESSAGE].pending.map((o) => (o.payload as { seq: number }).seq)).toEqual([1, 2])
    })
})
