/**
 * 收付款管理（方案 A 內控）前端 domain 純函式。
 *
 * 三條彼此獨立的狀態軸（與後端 models/finance_control_status.py 對齊）：
 * - approval_status：draft / pending_approval / approved / rejected / legacy
 * - settlement_status：unsettled / settled（現金報表唯一認列依據）
 * - reconciliation_status：unreconciled / reconciled / exception
 * 既有 status（pending/signed）維持「憑證狀態」語意（待補憑證/已簽收）。
 */

export type SignoffDirection = 'vendor' | 'misc'

export interface SignoffControlRecord {
  id: number
  status: string // 憑證軸：pending | signed
  approval_status: string
  settlement_status: string
  reconciliation_status: string
  created_by_id?: number | null
  settled_by_id?: number | null
}

// ─── 狀態文案（狀態不能只靠顏色，一律有文字）────────────────────────────
export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_approval: '待核准',
  approved: '已核准',
  rejected: '已駁回',
  legacy: '既有資料',
}

export const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  unreconciled: '待對帳',
  reconciled: '已對帳',
  exception: '異常待處理',
}

export const approvalStatusLabel = (v: string) => APPROVAL_STATUS_LABELS[v] ?? v

export const reconciliationStatusLabel = (v: string) =>
  RECONCILIATION_STATUS_LABELS[v] ?? v

export function settlementStatusLabel(
  v: string,
  direction: SignoffDirection,
): string {
  if (v === 'settled') return direction === 'vendor' ? '已付款' : '已收款'
  return direction === 'vendor' ? '未付款' : '未收款'
}

/** 憑證軸文案：舊「待簽收」改稱「待補憑證」（銀行轉帳不強迫簽名語言）。 */
export function evidenceStatusLabel(v: string): string {
  return v === 'signed' ? '已附憑證' : '待補憑證'
}

// ─── 下一步動作（每列唯一 primary next-action）──────────────────────────
export type NextActionKey =
  | 'submit'
  | 'edit_resubmit'
  | 'approve'
  | 'settle'
  | 'sign'
  | 'reconcile'
  | 'resolve_exception'

export interface NextAction {
  key: NextActionKey
  label: string
  /** 執行此動作需要的權限 code（bare code；呼叫端用 hasPermission 檢查） */
  permission: string
}

const PERM_PREFIX: Record<SignoffDirection, string> = {
  vendor: 'VENDOR_PAYMENT',
  misc: 'MISC_RECEIPT',
}

/**
 * 依三狀態軸推導這筆單據的唯一下一步。
 * 回傳 null 表示流程已完成（已對帳），僅剩檢視。
 */
export function resolveNextAction(
  record: Pick<
    SignoffControlRecord,
    'status' | 'approval_status' | 'settlement_status' | 'reconciliation_status'
  >,
  direction: SignoffDirection,
): NextAction | null {
  const p = PERM_PREFIX[direction]
  const { approval_status: ap, settlement_status: st, reconciliation_status: rc } =
    record

  if (rc === 'reconciled') return null
  if (rc === 'exception') {
    return { key: 'resolve_exception', label: '處理異常', permission: `${p}_RECONCILE` }
  }

  if (st !== 'settled') {
    if (ap === 'draft') return { key: 'submit', label: '送審', permission: `${p}_WRITE` }
    if (ap === 'rejected') {
      return { key: 'edit_resubmit', label: '修改重送', permission: `${p}_WRITE` }
    }
    if (ap === 'pending_approval') {
      return { key: 'approve', label: '核准', permission: `${p}_APPROVE` }
    }
    // approved（vendor 必經此步；misc 也可走）
    return {
      key: 'settle',
      label: direction === 'vendor' ? '確認付款' : '登記收款',
      permission: `${p}_SETTLE`,
    }
  }

  // 已收付：先收斂核准（misc 先收款情境），再補憑證，最後對帳
  if (ap === 'draft') return { key: 'submit', label: '送審', permission: `${p}_WRITE` }
  if (ap === 'pending_approval') {
    return { key: 'approve', label: '核准', permission: `${p}_APPROVE` }
  }
  if (record.status === 'pending') {
    return { key: 'sign', label: '補憑證', permission: `${p}_WRITE` }
  }
  return { key: 'reconcile', label: '對帳', permission: `${p}_RECONCILE` }
}

// ─── 鎖定判斷（與後端 assert_editable / assert_deletable 一致）──────────
/** 可全欄位編輯：草稿/被駁回、未收付、未附憑證。其他一律唯讀鎖定。 */
export function isRecordEditable(
  record: Pick<
    SignoffControlRecord,
    'status' | 'approval_status' | 'settlement_status'
  >,
): boolean {
  return (
    record.settlement_status === 'unsettled' &&
    record.status === 'pending' &&
    (record.approval_status === 'draft' || record.approval_status === 'rejected')
  )
}

export const isRecordDeletable = isRecordEditable

/** 鎖定原因說明（顯示在唯讀表單頂部，不是只把按鈕藏起來）。 */
export function recordLockReason(
  record: Pick<
    SignoffControlRecord,
    'status' | 'approval_status' | 'settlement_status'
  >,
  direction: SignoffDirection,
): string | null {
  if (isRecordEditable(record)) return null
  const verb = direction === 'vendor' ? '付款' : '收款'
  if (record.settlement_status === 'settled') {
    return `已${verb}資料已鎖定，更正需另走沖銷流程`
  }
  if (record.status === 'signed') {
    return '已附簽收憑證，資料不可再修改'
  }
  if (record.approval_status === 'pending_approval') {
    return '送審中不可修改；如需更正請由核准人駁回'
  }
  return '已核准的單據不可修改；如需更正請由核准人駁回後重新送審'
}

// ─── 結構化錯誤訊息解析 ─────────────────────────────────────────────────
/**
 * 內控端點錯誤 detail 為 {code, message}；舊端點為字串；Pydantic 422 為
 * array。統一取出可顯示訊息，避免 toast 出現 [object Object]。
 */
export function extractApiErrorMessage(e: unknown, fallback = '操作失敗'): string {
  const err = e as {
    response?: { data?: { detail?: unknown } }
  }
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined
      if (first && typeof first.msg === 'string') return first.msg
    }
  }
  return fallback
}
