/**
 * CT-F-06：離線佇列的租戶過濾必須 fail-open。
 *
 * 這支測試守的是「改造前入列、沒有 tenant_slug 欄位的舊記錄」——那是老師斷網點名後
 * 尚未同步的出勤資料。若哪天有人把過濾改成 fail-closed，這些記錄會被靜默丟棄且無從察覺，
 * 因此這裡直接以 raw IndexedDB put 造出「欄位不存在」的記錄（而非 tenant_slug: null）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { openDB } from 'idb'

// tenantSlug() 在 vitest 下恆為 null（單租戶模式），要驗多租戶行為只能替換它。
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
    listOps,
    listOtherUsersPendingOps,
    clearAll,
    OP_KINDS,
} from '@/utils/offlineQueue'
import { captureException } from '@/utils/sentry'

/** 直接寫入一筆不含 tenant_slug 的記錄，模擬改造前的殘留佇列。 */
async function putLegacyOp(id: string, userId: number, createdAt: string) {
    const db = await openDB('ivy-offline', 1)
    await db.put('pending_ops', {
        id,
        kind: OP_KINDS.CLASS_ATTENDANCE,
        payload: { date: '2026-04-19', entries: [] },
        user_id: userId,
        meta: {},
        status: 'pending',
        created_at: createdAt,
        attempts: 0,
        last_error: null,
    })
    db.close()
}

describe('offlineQueue 多租戶隔離（CT-F-06）', () => {
    beforeEach(async () => {
        tenantState.slug = null
        await clearAll() // 順帶確保 object store 已由 getDB() 建好，raw put 才有得寫
        vi.mocked(captureException).mockClear()
    })

    it('單租戶模式：enqueueOp 寫入 tenant_slug=null，listOps 不做任何租戶過濾', async () => {
        const rec = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { seq: 1 },
            userId: 7,
        })
        expect(rec.tenant_slug).toBeNull()

        await putLegacyOp('legacy-single', 7, '2026-04-01T00:00:00.000Z')

        const ops = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, userId: 7 })
        expect(ops.map((o: Record<string, unknown>) => o['id'])).toContain('legacy-single')
        expect(ops).toHaveLength(2)
        // 單租戶模式不得上報（否則每個既有部署都會噴一筆噪音）
        expect(captureException).not.toHaveBeenCalled()
    })

    it('多租戶模式：缺 tenant_slug 的舊記錄仍會被 listOps 回傳，並每 session 上報一次', async () => {
        await putLegacyOp('legacy-1', 7, '2026-04-01T00:00:00.000Z')
        await putLegacyOp('legacy-2', 7, '2026-04-02T00:00:00.000Z')
        tenantState.slug = 'alpha'

        const ops = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, userId: 7 })
        expect(ops.map((o: Record<string, unknown>) => o['id'])).toEqual(['legacy-1', 'legacy-2'])
        expect(captureException).toHaveBeenCalledTimes(1)
        expect(vi.mocked(captureException).mock.calls[0][0]).toBeInstanceOf(Error)
        expect((vi.mocked(captureException).mock.calls[0][0] as Error).message)
            .toBe('offlineQueue.tenant_slug_missing')

        // 每個 session 只報一次：第二次查詢照樣回傳資料，但不再上報
        const again = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, userId: 7 })
        expect(again).toHaveLength(2)
        expect(captureException).toHaveBeenCalledTimes(1)
    })

    it('多租戶模式：其他租戶的記錄被濾掉，本租戶的保留', async () => {
        tenantState.slug = 'alpha'
        const mine = await enqueueOp({
            kind: OP_KINDS.CLASS_ATTENDANCE,
            payload: { seq: 1 },
            userId: 7,
        })
        tenantState.slug = 'beta'
        await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { seq: 2 }, userId: 7 })

        tenantState.slug = 'alpha'
        const ops = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, userId: 7 })
        expect(ops).toHaveLength(1)
        expect(ops[0].id).toBe(mine.id)
    })

    it('listOtherUsersPendingOps 一律回傳，不做租戶過濾（漏提醒比多提醒糟）', async () => {
        tenantState.slug = 'beta'
        await enqueueOp({ kind: OP_KINDS.CLASS_ATTENDANCE, payload: { seq: 1 }, userId: 200 })
        await putLegacyOp('legacy-other', 300, '2026-04-01T00:00:00.000Z')

        tenantState.slug = 'alpha'
        const others = await listOtherUsersPendingOps(100, OP_KINDS.CLASS_ATTENDANCE)
        expect(others.map((o: Record<string, unknown>) => o['user_id']).sort()).toEqual([200, 300])
    })
})
