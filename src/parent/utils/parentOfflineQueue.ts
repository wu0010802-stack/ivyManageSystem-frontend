/**
 * 家長端離線寫入佇列 facade。
 *
 * Wraps src/utils/offlineQueue.ts 的純 CRUD 核心：
 * - enqueueParent: 自動注入 client_request_id 進 payload + 從 parentAuth store 抓 user_id
 * - flushParentQueue: 依 kind dispatch 對應 api saveFn
 * - flushAllParent: 5 kind 全跑、debounce 1s
 */
import {
  enqueueOp,
  listOps,
  removeOp,
  updateOp,
  OP_KINDS,
  OP_STATUS,
} from '@/utils/offlineQueue'
import { isNetworkError } from '@/composables/useOnlineStatus'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import api from '@/parent/api'
import { replyContactBook, ackContactBook } from '@/parent/api/contactBook'
import { acknowledgeEvent } from '@/parent/api/events'
import { createLeave } from '@/parent/api/leaves'

// PARENT_MESSAGE 仍在清單裡：親師訊息已於 2026-08-28 自家長端下架，但裝置上
// 可能還躺著離線時寫好、尚未送出的訊息。移出清單會讓那些 op 變成永遠不被
// flush、也不被計數的孤兒（ParentOfflineIndicator 走同一份 PARENT_KINDS），
// 等於靜默吞掉家長打的字。保留送出路徑讓既有佇列收斂完畢。
const PARENT_KINDS = [
  OP_KINDS.PARENT_MESSAGE,
  OP_KINDS.CONTACT_BOOK_REPLY,
  OP_KINDS.CONTACT_BOOK_ACK,
  OP_KINDS.EVENT_ACK,
  OP_KINDS.PARENT_LEAVE_REQUEST,
] as const

type ParentOpKind = typeof PARENT_KINDS[number]

export interface ParentEnqueueArgs {
  kind: ParentOpKind
  payload: Record<string, unknown>
  meta?: Record<string, unknown>
}

export interface FlushResult {
  succeeded: number
  needs_review: number
  kept: number
  auth_failed: boolean
}

function emptyFlushResult(): FlushResult {
  return {
    succeeded: 0,
    needs_review: 0,
    kept: 0,
    auth_failed: false,
  }
}

function currentParentUserId(): number | string | null {
  const authStore = useParentAuthStore()
  const userId = (authStore.user as Record<string, unknown> | null)?.['user_id']
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) return userId
  if (typeof userId === 'string' && userId.trim()) return userId
  return null
}

function genClientRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

export async function enqueueParent(args: ParentEnqueueArgs) {
  const userId = currentParentUserId()
  if (userId === null) throw new Error('enqueueParent 需要已登入家長 user_id')
  const payloadWithUuid = {
    ...args.payload,
    client_request_id: args.payload['client_request_id'] ?? genClientRequestId(),
  }
  return enqueueOp({
    kind: args.kind,
    payload: payloadWithUuid,
    userId,
    meta: args.meta ?? {},
  })
}

const SAVE_FN_BY_KIND: Record<ParentOpKind, (payload: Record<string, unknown>) => Promise<unknown>> = {
  // 後端端點仍在（本次只下架家長端 UI），故直接打；不再經 api/messages wrapper。
  [OP_KINDS.PARENT_MESSAGE]: (p) => api.post(`/parent/messages/threads/${p['thread_id']}/messages`, p),
  [OP_KINDS.CONTACT_BOOK_REPLY]: (p) => replyContactBook(p['entry_id'] as number, {
    body: p['body'] as string,
    client_request_id: p['client_request_id'] as string | undefined,
  }),
  [OP_KINDS.CONTACT_BOOK_ACK]: (p) => ackContactBook(p['entry_id'] as number),
  [OP_KINDS.EVENT_ACK]: (p) => acknowledgeEvent(p['event_id'] as number, p),
  [OP_KINDS.PARENT_LEAVE_REQUEST]: (p) => createLeave(p),
}

export async function flushParentQueue(
  kind: ParentOpKind,
  saveFn?: (payload: Record<string, unknown>) => Promise<unknown>
): Promise<FlushResult> {
  const fn = saveFn ?? SAVE_FN_BY_KIND[kind]
  const userId = currentParentUserId()
  if (userId === null) return emptyFlushResult()
  const ops = await listOps({
    kind,
    status: OP_STATUS.PENDING,
    userId,
  })
  const result = emptyFlushResult()
  for (const [index, op] of ops.entries()) {
    // 每筆送出前都重新核對目前登入者與 record owner，避免 flush 途中登出/換帳號後
    // 繼續用新 cookie 送出前一位家長的離線操作。
    if (currentParentUserId() !== userId || op['user_id'] !== userId) {
      result.kept += ops.length - index
      break
    }
    try {
      await fn(op.payload as Record<string, unknown>)
      await removeOp(op.id as string)
      result.succeeded += 1
    } catch (e) {
      const err = e as {
        response?: { status?: number; data?: { detail?: string } }
        message?: string
      }
      const status = err?.response?.status
      if (status === 409) {
        await removeOp(op.id as string)
        result.succeeded += 1
        continue
      }
      if (status === 401) {
        result.auth_failed = true
        const processed = result.succeeded + result.needs_review + result.kept
        const remaining = ops.length - processed - 1
        result.kept += 1 + Math.max(0, remaining)
        break
      }
      if (status === 403) {
        await updateOp(op.id as string, {
          status: OP_STATUS.NEEDS_REVIEW,
          last_error: err?.response?.data?.detail ?? 'forbidden',
        })
        result.needs_review += 1
        continue
      }
      if (isNetworkError(e)) {
        await updateOp(op.id as string, {
          attempts: ((op as Record<string, unknown>)['attempts'] as number || 0) + 1,
          last_error: '網路連線失敗',
        })
        result.kept += 1
        continue
      }
      const attempts = ((op as Record<string, unknown>)['attempts'] as number || 0) + 1
      if (attempts >= 5) {
        await updateOp(op.id as string, {
          status: OP_STATUS.NEEDS_REVIEW,
          attempts,
          last_error: err?.response?.data?.detail ?? err?.message ?? '重試次數過多',
        })
        result.needs_review += 1
      } else {
        await updateOp(op.id as string, {
          attempts,
          last_error: err?.response?.data?.detail ?? err?.message ?? '未知錯誤',
        })
        result.kept += 1
      }
    }
  }
  return result
}

let _flushAllDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _flushAllInFlight: Promise<FlushResult> | null = null
let _flushAllResolve: ((result: FlushResult) => void) | null = null
let _flushGeneration = 0

/** 登出時取消尚未開始的 debounce，並讓執行中的 flush 在下一筆 owner check 停止。 */
export function resetParentOfflineQueueRuntime(): void {
  _flushGeneration += 1
  if (_flushAllDebounceTimer) clearTimeout(_flushAllDebounceTimer)
  _flushAllDebounceTimer = null
  const resolve = _flushAllResolve
  _flushAllResolve = null
  _flushAllInFlight = null
  resolve?.(emptyFlushResult())
}

export function flushAllParent(): Promise<FlushResult> {
  if (_flushAllInFlight) return _flushAllInFlight
  if (_flushAllDebounceTimer) clearTimeout(_flushAllDebounceTimer)
  const generation = _flushGeneration
  let promise: Promise<FlushResult>
  promise = new Promise((resolve) => {
    _flushAllResolve = resolve
    _flushAllDebounceTimer = setTimeout(async () => {
      _flushAllDebounceTimer = null
      const total = emptyFlushResult()
      for (const kind of PARENT_KINDS) {
        if (generation !== _flushGeneration) break
        const r = await flushParentQueue(kind)
        total.succeeded += r.succeeded
        total.needs_review += r.needs_review
        total.kept += r.kept
        total.auth_failed = total.auth_failed || r.auth_failed
        if (r.auth_failed) break
      }
      if (_flushAllInFlight === promise) {
        _flushAllInFlight = null
        _flushAllResolve = null
      }
      resolve(total)
    }, 1000)
  })
  _flushAllInFlight = promise
  return promise
}

export { PARENT_KINDS, type ParentOpKind }
