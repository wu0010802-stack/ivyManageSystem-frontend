/**
 * 點名離線佇列的 flush 邏輯。
 *
 * 分離出來方便單測：不依賴 Vue 元件，只需注入 `saveFn`（實際呼叫後端的函式）。
 */
import {
    listOps,
    removeOp,
    updateOp,
    OP_KINDS,
    OP_STATUS,
} from './offlineQueue'
import { isNetworkError } from '@/composables/useOnlineStatus'

type AttendanceEntry = { student_id?: unknown }
type AttendancePayload = { date?: unknown; classroom_id?: unknown; entries?: unknown }

function payloadKey(payload: unknown): string | null {
    const p = payload as AttendancePayload | null
    if (!p || p.date == null || p.classroom_id == null) return null
    return `${String(p.date)}|${String(p.classroom_id)}`
}

function payloadEntries(payload: unknown): AttendanceEntry[] {
    const entries = (payload as AttendancePayload | null)?.entries
    return Array.isArray(entries) ? (entries as AttendanceEntry[]) : []
}

/**
 * 把佇列 op 中「已被較新儲存覆蓋」的學生剔除（後端 batch 是盲目 upsert，舊 payload
 * 晚送會把新狀態寫回，且非缺席→缺席會再發家長缺席推播）。
 *
 * - 剔除後 entries 為空 → 整筆 op 移除
 * - 部分剔除 → updateOp 改寫 payload
 * 回傳是否整筆移除。
 */
async function stripCoveredStudents(
    op: { id: string; payload: unknown },
    covered: Set<string>,
): Promise<boolean> {
    const entries = payloadEntries(op.payload)
    if (entries.length === 0) return false
    const kept = entries.filter((e) => !covered.has(String(e.student_id)))
    if (kept.length === entries.length) return false
    if (kept.length === 0) {
        await removeOp(op.id)
        return true
    }
    await updateOp(op.id, { payload: { ...(op.payload as Record<string, unknown>), entries: kept } })
    op.payload = { ...(op.payload as Record<string, unknown>), entries: kept }
    return false
}

/**
 * 線上儲存成功後呼叫：同使用者、同 (date, classroom_id) 的佇列 op（pending 與
 * needs_review）中，凡是這次已儲存過的學生一律剔除，避免之後補送舊狀態蓋掉新點名。
 *
 * @returns 被整筆移除的 op 數
 */
export async function discardSupersededClassAttendanceOps(
    savedPayload: unknown,
    opts: { userId?: number | string } = {},
): Promise<number> {
    const key = payloadKey(savedPayload)
    if (key == null) return 0
    const covered = new Set(payloadEntries(savedPayload).map((e) => String(e.student_id)))
    if (covered.size === 0) return 0
    const ops = await listOps({ kind: OP_KINDS.CLASS_ATTENDANCE, status: null, userId: opts.userId })
    let removed = 0
    for (const op of ops) {
        if (op['status'] !== OP_STATUS.PENDING && op['status'] !== OP_STATUS.NEEDS_REVIEW) continue
        if (payloadKey(op['payload']) !== key) continue
        if (await stripCoveredStudents(op as { id: string; payload: unknown }, covered)) removed += 1
    }
    return removed
}

/**
 * @typedef {Object} FlushResult
 * @property {number} succeeded - 成功同步筆數
 * @property {number} needs_review - 標為需人工處理筆數（例如 403）
 * @property {number} kept - 仍保留為 pending（暫時失敗，會再試）
 * @property {boolean} auth_failed - 是否遇到 401（呼叫端要提示重新登入）
 */

/**
 * @param {Function} saveFn - 例如 `batchSaveClassAttendance`，吃 payload，回傳 Promise
 * @param {Object} [opts]
 * @param {number|string} opts.userId - 只 flush 此 user 建立的 ops；缺失時 fail-closed 不送出
 * @returns {Promise<FlushResult>}
 */
export async function flushClassAttendanceQueue(saveFn: (payload: unknown) => Promise<unknown>, opts: { userId?: number | string } = {}) {
    const ops = await listOps({
        kind: OP_KINDS.CLASS_ATTENDANCE,
        status: OP_STATUS.PENDING,
        userId: opts.userId,
    })

    // 同 (date, classroom_id) 有多筆 pending：由新到舊掃，較舊 op 中已被較新 op 涵蓋
    // 的學生剔除，避免依 created_at 依序重送時舊狀態最後才寫入、蓋掉老師的最新點名。
    const coveredByKey = new Map<string, Set<string>>()
    const removedIds = new Set<string>()
    for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i] as { id: string; payload: unknown }
        const key = payloadKey(op.payload)
        if (key == null) continue
        const covered = coveredByKey.get(key) ?? new Set<string>()
        if (await stripCoveredStudents(op, covered)) removedIds.add(op.id)
        for (const e of payloadEntries(op.payload)) covered.add(String(e.student_id))
        coveredByKey.set(key, covered)
    }

    const result = {
        succeeded: 0,
        needs_review: 0,
        kept: 0,
        auth_failed: false,
    }

    const sendable = ops.filter((op) => !removedIds.has((op as { id: string }).id))

    for (const op of sendable) {
        try {
            await saveFn(op.payload)
            await removeOp(op.id)
            result.succeeded += 1
        } catch (error) {
            const err = error as { response?: { status?: number; data?: { detail?: string } }; message?: string }
            const status = err?.response?.status
            if (status === 401) {
                // Session 過期：保留整個佇列，停止後續重送避免連續 401
                result.auth_failed = true
                // 已處理筆數必須含先前累計的 kept（網路失敗保留的那幾筆），否則剩餘數
                // 會把它們再算一次 → kept 大於佇列總長度。
                // 家長端 flushParentQueue 用的是同一個公式，兩邊不得再分歧。
                const processed = result.succeeded + result.needs_review + result.kept
                const remaining = sendable.length - processed - 1
                result.kept += 1 + Math.max(0, remaining)
                break
            }
            if (status === 403) {
                // 學生轉班或權限變更：不可能自動恢復，標為人工處理
                await updateOp(op.id, {
                    status: OP_STATUS.NEEDS_REVIEW,
                    last_error: err?.response?.data?.detail || '無權操作（可能學生已轉班）',
                })
                result.needs_review += 1
                continue
            }
            if (isNetworkError(error)) {
                // 還是離線：保留後重試
                await updateOp(op.id, {
                    attempts: ((op as Record<string, unknown>)['attempts'] as number || 0) + 1,
                    last_error: '網路連線失敗',
                })
                result.kept += 1
                continue
            }
            // 其他錯誤（400/500）：累計 attempts，若超過 5 次標為 needs_review
            const attempts = ((op as Record<string, unknown>)['attempts'] as number || 0) + 1
            if (attempts >= 5) {
                await updateOp(op.id, {
                    status: OP_STATUS.NEEDS_REVIEW,
                    attempts,
                    last_error: err?.response?.data?.detail || err?.message || '重試次數過多',
                })
                result.needs_review += 1
            } else {
                await updateOp(op.id, {
                    attempts,
                    last_error: err?.response?.data?.detail || err?.message || '未知錯誤',
                })
                result.kept += 1
            }
        }
    }

    return result
}
