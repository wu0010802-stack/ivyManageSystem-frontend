/**
 * 離線操作佇列。以 IndexedDB 存放斷網時累積的寫入請求，
 * 恢復連線後由頁面呼叫 flush 重送。
 *
 * 目前僅供教師點名與家長端使用（`src/parent/utils/parentOfflineQueue.ts` 是本檔的
 * facade，共用同一個 DB）；若未來要支援其他寫入，增加 `kind` 區分。
 *
 * ## 多租戶（CT-F-06）——以下三項是刻意的取捨，請勿「統一」成 fail-closed
 *
 * 1. **不得 bump `DB_VERSION`（維持 1）**。升版後前端一旦回滾，舊 bundle 的
 *    `openDB(name, 1)` 會因為 DB 版本較高而 reject，且該 rejection 被快取在
 *    `_dbPromise` —— 含尚未同步出勤資料的整個離線佇列會全面不可用，且沒有回滾路徑。
 *    `tenant_slug` 只是 record 上的一個新欄位，不需要 schema 變更即可加。
 * 2. **`enqueueOp` 用 nullable 的 `tenantSlug()`**（單租戶模式寫 `null`），
 *    **絕不可**在任何讀寫路徑呼叫會 throw 的 `requireTenantSlug()`：在 versionchange
 *    transaction 內 throw 會讓整個 `openDB` reject，等同上一項的災難。
 * 3. **`listOps` 對缺 `tenant_slug` 的舊記錄視為本租戶並回傳**（`== null` 放行）。
 *    這些是改造前寫入的離線出勤資料，fail-closed 丟棄等於靜默丟失家長看得到的出勤，
 *    比「極端情境下多送一筆」嚴重得多。命中時每個 session 上報一次 Sentry 供觀測。
 *    `listOtherUsersPendingOps` **一律回傳、完全不做 tenant 過濾**：它的用途是「提醒
 *    有他人未送出的佇列」，漏提醒（資料留在裝置上沒人知道）比多提醒糟。
 */
import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import { tenantSlug } from '@/utils/tenant'
import { captureException } from '@/utils/sentry'

const DB_NAME = 'ivy-offline'
// ⚠ 不得 bump（見檔頭 CT-F-06 第 1 點）。
const DB_VERSION = 1
const STORE = 'pending_ops'

let _dbPromise: Promise<IDBPDatabase> | null = null

/** 每個 session 只回報一次「命中缺 tenant_slug 的舊記錄」，避免灌爆 Sentry quota。 */
let _missingTenantReported = false

type QueueUserId = number | string

function isValidUserId(userId: unknown): userId is QueueUserId {
    if (typeof userId === 'number') return Number.isFinite(userId) && userId > 0
    return typeof userId === 'string' && userId.trim().length > 0
}

function getDB() {
    if (!_dbPromise) {
        _dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE)) {
                    const store = db.createObjectStore(STORE, {
                        keyPath: 'id',
                    })
                    store.createIndex('by_created', 'created_at')
                    store.createIndex('by_kind', 'kind')
                    store.createIndex('by_status', 'status')
                }
            },
        })
    }
    return _dbPromise
}

function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 加入一筆待送出的離線操作。
 * @param {Object} op
 * @param {string} op.kind - 例如 'class_attendance'
 * @param {Object} op.payload - 要送給後端的 body
 * @param {number|string} op.userId - 建立此 op 的使用者 id（避免共享平板跨老師送錯）
 * @param {Object} [op.meta] - UI 顯示用（教師姓名、班級、日期等）
 * @returns {Promise<Object>} 含 id、created_at、status='pending'、tenant_slug
 */
export async function enqueueOp({ kind, payload, userId, meta = {} }: { kind: string; payload: unknown; userId: number | string; meta?: Record<string, unknown> }) {
    if (!isValidUserId(userId)) {
        throw new Error('enqueueOp 需要 userId 以避免共享裝置跨使用者送出')
    }
    const db = await getDB()
    const record = {
        id: genId(),
        kind,
        payload,
        user_id: userId,
        // 單租戶模式為 null（灰度不變式）；不用 requireTenantSlug（見檔頭 CT-F-06 第 2 點）
        tenant_slug: tenantSlug(),
        meta,
        status: 'pending',
        created_at: new Date().toISOString(),
        attempts: 0,
        last_error: null,
    }
    await db.put(STORE, record)
    return record
}

/**
 * 取得指定 kind 的待送出操作。
 *
 * 預設只回傳**當前 userId**（若有傳）的記錄——共享裝置的場景：
 * 老師 A 離線點名後登出，老師 B 登入不該把 A 的佇列帶著一起送。
 *
 * @param {Object} [opts]
 * @param {string} [opts.kind]
 * @param {string} [opts.status] - 預設只回傳 'pending'，傳入 null 取全部
 * @param {number|string} opts.userId - 必填的目前使用者 id；缺失時 fail-closed 回空陣列
 *
 * 租戶過濾為 **fail-open**：缺 `tenant_slug` 的舊記錄視為本租戶並回傳（見檔頭 CT-F-06
 * 第 3 點）。單租戶模式（`tenantSlug()` 為 null）完全不過濾也不上報。
 */
export async function listOps({ kind, status = 'pending', userId }: { kind?: string; status?: string | null; userId?: number | string | null } = {}) {
    if (!isValidUserId(userId)) return []
    const db = await getDB()
    const all = await db.getAll(STORE)
    const current = tenantSlug()
    let legacyHits = 0
    const matched = all.filter((op: Record<string, unknown>) => {
        if (status && op['status'] !== status) return false
        if (kind && op['kind'] !== kind) return false
        if (op['user_id'] !== userId) return false
        if (current !== null) {
            const slug = op['tenant_slug']
            // 舊記錄（改造前入列）沒有這個欄位 → 放行，但記一筆供觀測
            if (slug == null) legacyHits++
            else if (slug !== current) return false
        }
        return true
    })
    if (legacyHits > 0 && current !== null) reportMissingTenantSlug(current, legacyHits)
    return matched.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a['created_at'] as string).localeCompare(b['created_at'] as string))
}

/** 每 session 一次的觀測回報；上報失敗絕不能傳染回離線佇列的讀取路徑。 */
function reportMissingTenantSlug(current: string, count: number): void {
    if (_missingTenantReported) return
    _missingTenantReported = true
    captureException(new Error('offlineQueue.tenant_slug_missing'), {
        current_tenant_slug: current,
        legacy_op_count: count,
    }).catch(() => {})
}

export async function getOp(id: string) {
    const db = await getDB()
    return db.get(STORE, id)
}

export async function removeOp(id: string) {
    const db = await getDB()
    await db.delete(STORE, id)
}

/**
 * 更新 op 狀態（例如標記為 failed_permanent 或累計 attempts）。
 */
export async function updateOp(id: string, patch: Record<string, unknown>) {
    const db = await getDB()
    const current = await db.get(STORE, id)
    if (!current) return null
    const next = { ...current, ...patch }
    await db.put(STORE, next)
    return next
}

export async function countPending(kind: string, userId: number | string | undefined) {
    const ops = await listOps({ kind, status: 'pending', userId })
    return ops.length
}

/**
 * 偵測是否有「其他使用者」留下的 pending ops。
 * 共享平板場景用：老師 A 留下未送，老師 B 登入時要提示而不要自動送。
 *
 * ⚠ **刻意不做 tenant 過濾**（CT-F-06 第 3 點）：漏提醒 = 佇列留在裝置上沒人知道，
 * 比跨租戶多提醒一次糟得多。本函式只用於提示，不會代替任何人送出。
 *
 * @param {number|string} currentUserId - 目前登入者的 id
 * @param {string} [kind]
 * @returns {Promise<Array>} 不屬於 currentUserId 的 pending ops
 */
export async function listOtherUsersPendingOps(currentUserId: number | string, kind?: string) {
    if (!isValidUserId(currentUserId)) return []
    const db = await getDB()
    const all = await db.getAll(STORE)
    return all.filter((op: Record<string, unknown>) => {
        if (op['status'] !== 'pending') return false
        if (kind && op['kind'] !== kind) return false
        return op['user_id'] !== currentUserId
    })
}

export async function clearAll() {
    const db = await getDB()
    await db.clear(STORE)
}

/** テスト専用：DB 接続キャッシュをリセット（fake-indexeddb を再初期化した後に呼ぶ） */
export function _resetDbForTests() {
    _dbPromise = null
}

export const OP_KINDS = Object.freeze({
    CLASS_ATTENDANCE: 'class_attendance',
    // 家長端 offline queue（spec 2026-05-26）
    PARENT_MESSAGE: 'parent_message',
    CONTACT_BOOK_REPLY: 'contact_book_reply',
    CONTACT_BOOK_ACK: 'contact_book_ack',
    EVENT_ACK: 'event_ack',
    PARENT_LEAVE_REQUEST: 'parent_leave_request',
})

export type OpKind = typeof OP_KINDS[keyof typeof OP_KINDS]

export const OP_STATUS = Object.freeze({
    PENDING: 'pending',
    NEEDS_REVIEW: 'needs_review',
})
