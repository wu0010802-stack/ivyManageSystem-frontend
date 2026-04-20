/**
 * 離線操作佇列。以 IndexedDB 存放斷網時累積的寫入請求，
 * 恢復連線後由頁面呼叫 flush 重送。
 *
 * 目前僅供教師點名使用；若未來要支援其他寫入，增加 `kind` 區分。
 */
import { openDB } from 'idb'

const DB_NAME = 'ivy-offline'
const DB_VERSION = 1
const STORE = 'pending_ops'

let _dbPromise = null

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
 * @returns {Promise<Object>} 含 id、created_at、status='pending'
 */
export async function enqueueOp({ kind, payload, userId, meta = {} }) {
    if (userId === undefined || userId === null) {
        throw new Error('enqueueOp 需要 userId 以避免共享裝置跨使用者送出')
    }
    const db = await getDB()
    const record = {
        id: genId(),
        kind,
        payload,
        user_id: userId,
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
 * @param {number|string} [opts.userId] - 指定過濾的使用者 id；傳 null 表示不過濾
 */
export async function listOps({ kind, status = 'pending', userId } = {}) {
    const db = await getDB()
    const all = await db.getAll(STORE)
    return all.filter((op) => {
        if (status && op.status !== status) return false
        if (kind && op.kind !== kind) return false
        if (userId !== undefined && userId !== null && op.user_id !== userId) return false
        return true
    }).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function getOp(id) {
    const db = await getDB()
    return db.get(STORE, id)
}

export async function removeOp(id) {
    const db = await getDB()
    await db.delete(STORE, id)
}

/**
 * 更新 op 狀態（例如標記為 failed_permanent 或累計 attempts）。
 */
export async function updateOp(id, patch) {
    const db = await getDB()
    const current = await db.get(STORE, id)
    if (!current) return null
    const next = { ...current, ...patch }
    await db.put(STORE, next)
    return next
}

export async function countPending(kind, userId) {
    const ops = await listOps({ kind, status: 'pending', userId })
    return ops.length
}

/**
 * 偵測是否有「其他使用者」留下的 pending ops。
 * 共享平板場景用：老師 A 留下未送，老師 B 登入時要提示而不要自動送。
 *
 * @param {number|string} currentUserId - 目前登入者的 id
 * @param {string} [kind]
 * @returns {Promise<Array>} 不屬於 currentUserId 的 pending ops
 */
export async function listOtherUsersPendingOps(currentUserId, kind) {
    const db = await getDB()
    const all = await db.getAll(STORE)
    return all.filter((op) => {
        if (op.status !== 'pending') return false
        if (kind && op.kind !== kind) return false
        return op.user_id !== currentUserId
    })
}

export async function clearAll() {
    const db = await getDB()
    await db.clear(STORE)
}

export const OP_KINDS = Object.freeze({
    CLASS_ATTENDANCE: 'class_attendance',
})

export const OP_STATUS = Object.freeze({
    PENDING: 'pending',
    NEEDS_REVIEW: 'needs_review',
})
