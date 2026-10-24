/**
 * 家長端離線寫入佇列 facade。
 *
 * Wraps src/utils/offlineQueue.ts 的純 CRUD 核心：
 * - enqueueParent: 自動注入 client_request_id 進 payload + 從 parentAuth store 抓 user_id
 * - flushParentQueue: 依 kind dispatch 對應 api saveFn
 * - flushAllParent: 5 kind 全跑、debounce 1s
 * - 回饋：背景補送成功依 kind 跳中文 toast（announceSynced），並通知訂閱者
 *   （onParentQueueChange）讓頁面重抓；家長看不到 kind 內部代碼（PARENT_KIND_LABEL）
 * - 逐筆處理：listParentQueued / retryParentOp / discardParentOp
 */
import { watch } from 'vue'
import type { AxiosRequestConfig } from 'axios'
import {
  enqueueOp,
  listOps,
  listOpsForKinds,
  removeOp,
  updateOp,
  OP_KINDS,
  OP_STATUS,
} from '@/utils/offlineQueue'
import { toast } from '@/parent/utils/toast'
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

const SAVE_FN_BY_KIND: Record<ParentOpKind, (payload: Record<string, unknown>, config?: AxiosRequestConfig) => Promise<unknown>> = {
  // 後端端點仍在（本次只下架家長端 UI），故直接打；不再經 api/messages wrapper。
  [OP_KINDS.PARENT_MESSAGE]: (p, config) => api.post(`/parent/messages/threads/${p['thread_id']}/messages`, p, config),
  [OP_KINDS.CONTACT_BOOK_REPLY]: (p, config) => replyContactBook(p['entry_id'] as number, {
    body: p['body'] as string,
    client_request_id: p['client_request_id'] as string | undefined,
  }, config),
  [OP_KINDS.CONTACT_BOOK_ACK]: (p, config) => ackContactBook(p['entry_id'] as number, config),
  [OP_KINDS.EVENT_ACK]: (p, config) => acknowledgeEvent(p['event_id'] as number, p, config),
  [OP_KINDS.PARENT_LEAVE_REQUEST]: (p, config) => createLeave(p, config),
}

/**
 * 送出單一 kind 的佇列。登出流程（logoutContext）不跳回饋——畫面已清空，
 * 也不該對下一位登入者說「請假已送出」。
 */
export async function flushParentQueue(
  kind: ParentOpKind,
  saveFn?: (payload: Record<string, unknown>) => Promise<unknown>,
  logoutContext?: LogoutFlushContext,
): Promise<FlushResult> {
  const result = await flushKind(kind, saveFn, logoutContext)
  if (!logoutContext) reportFlush({ [kind]: result.succeeded }, result)
  return result
}

async function flushKind(
  kind: ParentOpKind,
  saveFn?: (payload: Record<string, unknown>) => Promise<unknown>,
  logoutContext?: LogoutFlushContext,
): Promise<FlushResult> {
  const fn = saveFn ?? SAVE_FN_BY_KIND[kind]
  const generation = _flushGeneration
  const userId = logoutContext?.userId ?? currentParentUserId()
  if (userId === null) return emptyFlushResult()
  const valid = () => generation === _flushGeneration && (logoutContext ? logoutContext.valid() : currentParentUserId() === userId)
  const ops = await listOps({
    kind,
    status: OP_STATUS.PENDING,
    userId,
  })
  const result = emptyFlushResult()
  for (const [index, op] of ops.entries()) {
    // 每筆送出前都重新核對目前登入者與 record owner，避免 flush 途中登出/換帳號後
    // 繼續用新 cookie 送出前一位家長的離線操作。
    if (!valid() || op['user_id'] !== userId) {
      result.kept += ops.length - index
      break
    }
    try {
      await fn(op.payload as Record<string, unknown>, logoutContext?.config)
      await removeOp(op.id as string)
      result.succeeded += 1
    } catch (e) {
      if (!valid()) {
        result.kept += ops.length - index
        break
      }
      const err = e as {
        response?: { status?: number; data?: { detail?: string } }
        message?: string
      }
      const status = err?.response?.status
      // F15：409 不再視同成功。後端各佇列端點的冪等重播回 2xx，409 一律是衝突
      // （leaves client_request_id 用於不同請假＝永久、請求衝突請重試＝可重試），
      // 走下方一般失敗路徑：attempts+1、滿 5 次轉 needs_review、保留 last_error。
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


interface LogoutFlushContext {
  userId: number | string
  valid: () => boolean
  config: AxiosRequestConfig
}

/** 僅登出流程使用：畫面已清空後，以本輪 owner 送出，絕不恢復 auth。 */
export function createParentLogoutFlush(userId: number | string) {
  const generation = _flushGeneration
  const controller = new AbortController()
  const auth = useParentAuthStore()
  const stop = watch(() => auth.user, () => controller.abort(), { flush: 'sync' })
  const valid = () => !controller.signal.aborted && generation === _flushGeneration && auth.user === null
  const context: LogoutFlushContext = {
    userId,
    valid,
    config: { signal: controller.signal, parentSessionGuard: valid },
  }
  return {
    revoke() { controller.abort(); stop() },
    async flush() {
      const total = emptyFlushResult()
      for (const kind of PARENT_KINDS) {
        if (!valid()) break
        const result = await flushParentQueue(kind, undefined, context)
        total.succeeded += result.succeeded
        total.needs_review += result.needs_review
        total.kept += result.kept
        total.auth_failed ||= result.auth_failed
        if (result.auth_failed) break
      }
      return total
    },
  }
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
      const succeededByKind: SucceededByKind = {}
      for (const kind of PARENT_KINDS) {
        if (generation !== _flushGeneration) break
        // 逐 kind 送，但回饋合併成一則（同時補送請假與簽閱時不連跳兩個 toast）
        const r = await flushKind(kind)
        succeededByKind[kind] = r.succeeded
        total.succeeded += r.succeeded
        total.needs_review += r.needs_review
        total.kept += r.kept
        total.auth_failed = total.auth_failed || r.auth_failed
        if (r.auth_failed) break
      }
      if (generation === _flushGeneration) reportFlush(succeededByKind, total)
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

// ---------------------------------------------------------------------------
// 回饋：家長看得懂的名稱、補送成功 toast、佇列變動通知
// ---------------------------------------------------------------------------

type SucceededByKind = Partial<Record<ParentOpKind, number>>

/** 佇列 kind 的家長可讀名稱（kind 是內部代碼，不得直接顯示）。 */
export const PARENT_KIND_LABEL: Record<ParentOpKind, string> = {
  [OP_KINDS.PARENT_MESSAGE]: '親師訊息',
  [OP_KINDS.CONTACT_BOOK_REPLY]: '聯絡簿留言',
  [OP_KINDS.CONTACT_BOOK_ACK]: '聯絡簿已讀',
  [OP_KINDS.EVENT_ACK]: '事件簽閱',
  [OP_KINDS.PARENT_LEAVE_REQUEST]: '請假申請',
}

/** 背景補送成功時的單一 kind 文案。 */
const SYNCED_TEXT: Record<ParentOpKind, string> = {
  [OP_KINDS.PARENT_MESSAGE]: '訊息已送出',
  [OP_KINDS.CONTACT_BOOK_REPLY]: '聯絡簿留言已送出',
  [OP_KINDS.CONTACT_BOOK_ACK]: '聯絡簿已讀已同步',
  [OP_KINDS.EVENT_ACK]: '事件簽閱已送出',
  [OP_KINDS.PARENT_LEAVE_REQUEST]: '請假已送出',
}

/** 同一句回饋在這段時間內不重複跳（頁面自己的 flush 與全域 flush 可能同時成功）。 */
const ANNOUNCE_DEDUPE_MS = 4000
const _lastAnnounced = new Map<string, number>()

/** 依各 kind 成功筆數組出一句回饋；沒有成功的回 null。 */
export function syncedMessage(byKind: SucceededByKind): string | null {
  const done = PARENT_KINDS.filter((k) => (byKind[k] ?? 0) > 0)
  if (done.length === 0) return null
  if (done.length === 1) {
    const kind = done[0]
    const n = byKind[kind] ?? 0
    return n > 1 ? `${SYNCED_TEXT[kind]}（${n} 筆）` : SYNCED_TEXT[kind]
  }
  return `離線暫存的${done.map((k) => PARENT_KIND_LABEL[k]).join('、')}已送出`
}

function announceSynced(byKind: SucceededByKind): void {
  const message = syncedMessage(byKind)
  if (!message) return
  const now = Date.now()
  const last = _lastAnnounced.get(message)
  if (last !== undefined && now - last < ANNOUNCE_DEDUPE_MS) return
  _lastAnnounced.set(message, now)
  toast.success(message)
}

export interface ParentQueueChange {
  /** 這次送出成功的各 kind 筆數（捨棄／狀態變更時為空物件）。 */
  succeededByKind: SucceededByKind
}
type QueueChangeListener = (change: ParentQueueChange) => void
const _changeListeners = new Set<QueueChangeListener>()

/** 訂閱「佇列內容變了」（送出成功、轉為無法同步、被捨棄）。回傳取消訂閱。 */
export function onParentQueueChange(listener: QueueChangeListener): () => void {
  _changeListeners.add(listener)
  return () => { _changeListeners.delete(listener) }
}

function notifyQueueChange(change: ParentQueueChange): void {
  for (const listener of _changeListeners) {
    try {
      listener(change)
    } catch {
      // 訂閱者例外不得傳染回 flush 路徑
    }
  }
}

function reportFlush(byKind: SucceededByKind, result: FlushResult): void {
  if (result.succeeded > 0) announceSynced(byKind)
  if (result.succeeded > 0 || result.needs_review > 0) notifyQueueChange({ succeededByKind: byKind })
}

/** 測試用：清掉回饋去重紀錄。 */
export function _resetParentQueueFeedbackForTests(): void {
  _lastAnnounced.clear()
}

// ---------------------------------------------------------------------------
// 逐筆處理（「N 筆無法同步」對話框、請假列表的待送出佔位卡）
// ---------------------------------------------------------------------------

export type ParentQueuedOp = Record<string, unknown> & { id: string; kind: ParentOpKind; status: string }

/** 目前家長在某個 kind 還沒送出的 op（待送出＋無法同步），依建立時間排序。 */
export async function listParentQueued(kind: ParentOpKind): Promise<ParentQueuedOp[]> {
  const userId = currentParentUserId()
  if (userId === null) return []
  const grouped = await listOpsForKinds({ kinds: [kind], userId })
  return [...grouped[kind].pending, ...grouped[kind].needs_review] as ParentQueuedOp[]
}

/** 把一筆「無法同步」的 op 放回待送出並立即重送該 kind。 */
export async function retryParentOp(op: { id: string; kind: ParentOpKind }): Promise<FlushResult> {
  await updateOp(op.id, { status: OP_STATUS.PENDING, attempts: 0, last_error: null })
  // 狀態已從「無法同步」變回「待送出」：這次重送若只是又被保留（kept），reportFlush
  // 不會通知，只靠訂閱更新的畫面（請假列表佔位卡）會一直掛著「無法送出」
  notifyQueueChange({ succeededByKind: {} })
  return flushParentQueue(op.kind)
}

/** 家長確認後捨棄一筆 op（不再送出）。 */
export async function discardParentOp(id: string): Promise<void> {
  await removeOp(id)
  notifyQueueChange({ succeededByKind: {} })
}

/** op 的內容摘要（給家長辨認是哪一筆）；沒有可顯示的資訊回空字串。 */
export function describeParentOp(op: Record<string, unknown>): string {
  const payload = (op['payload'] ?? {}) as Record<string, unknown>
  const meta = (op['meta'] ?? {}) as Record<string, unknown>
  switch (op['kind']) {
    case OP_KINDS.PARENT_LEAVE_REQUEST: {
      const start = typeof payload['start_date'] === 'string' ? payload['start_date'] : ''
      const end = typeof payload['end_date'] === 'string' ? payload['end_date'] : ''
      const range = end && end !== start ? `${start}～${end}` : start
      return [payload['leave_type'], range].filter((x) => typeof x === 'string' && x).join(' ')
    }
    case OP_KINDS.EVENT_ACK:
      return typeof meta['title'] === 'string' ? meta['title'] : ''
    case OP_KINDS.CONTACT_BOOK_ACK:
      return typeof meta['log_date'] === 'string' ? `${meta['log_date']} 的聯絡簿` : ''
    default:
      return ''
  }
}

/**
 * last_error 轉成家長看得懂的原因。來源可能是後端 detail（多為中文）、BusinessError
 * envelope 物件、axios 英文訊息或內部標記（forbidden），一律不原樣顯示英文／代碼。
 */
export function friendlyOpError(lastError: unknown): string {
  if (lastError && typeof lastError === 'object') {
    const msg = (lastError as { message?: unknown }).message
    return typeof msg === 'string' && msg ? msg : '園所系統拒絕了這筆資料'
  }
  if (typeof lastError !== 'string' || !lastError) return '原因不明'
  if (lastError === 'forbidden') return '沒有權限送出（帳號或孩子綁定可能已變更）'
  if (lastError === '重試次數過多') return '已嘗試多次仍失敗'
  if (/status code|network error|timeout|canceled/i.test(lastError)) return '園所系統暫時無法處理'
  return lastError
}

export { PARENT_KINDS, type ParentOpKind }
