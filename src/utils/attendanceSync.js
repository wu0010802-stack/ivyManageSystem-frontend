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
 * @param {number|string} [opts.userId] - 只 flush 此 user 建立的 ops（共享平板場景必傳）
 * @returns {Promise<FlushResult>}
 */
export async function flushClassAttendanceQueue(saveFn, opts = {}) {
    const ops = await listOps({
        kind: OP_KINDS.CLASS_ATTENDANCE,
        status: OP_STATUS.PENDING,
        userId: opts.userId,
    })

    const result = {
        succeeded: 0,
        needs_review: 0,
        kept: 0,
        auth_failed: false,
    }

    for (const op of ops) {
        try {
            await saveFn(op.payload)
            await removeOp(op.id)
            result.succeeded += 1
        } catch (error) {
            const status = error?.response?.status
            if (status === 401) {
                // Session 過期：保留整個佇列，停止後續重送避免連續 401
                result.auth_failed = true
                result.kept += 1
                // 剩下的也當保留
                result.kept += ops.length - result.succeeded - result.needs_review - 1
                break
            }
            if (status === 403) {
                // 學生轉班或權限變更：不可能自動恢復，標為人工處理
                await updateOp(op.id, {
                    status: OP_STATUS.NEEDS_REVIEW,
                    last_error: error?.response?.data?.detail || '無權操作（可能學生已轉班）',
                })
                result.needs_review += 1
                continue
            }
            if (isNetworkError(error)) {
                // 還是離線：保留後重試
                await updateOp(op.id, {
                    attempts: (op.attempts || 0) + 1,
                    last_error: '網路連線失敗',
                })
                result.kept += 1
                continue
            }
            // 其他錯誤（400/500）：累計 attempts，若超過 5 次標為 needs_review
            const attempts = (op.attempts || 0) + 1
            if (attempts >= 5) {
                await updateOp(op.id, {
                    status: OP_STATUS.NEEDS_REVIEW,
                    attempts,
                    last_error: error?.response?.data?.detail || error?.message || '重試次數過多',
                })
                result.needs_review += 1
            } else {
                await updateOp(op.id, {
                    attempts,
                    last_error: error?.response?.data?.detail || error?.message || '未知錯誤',
                })
                result.kept += 1
            }
        }
    }

    return result
}
