/**
 * 收款確認狀態顯示邏輯（SPEC-014 §16 帳單×對帳打通）。
 *
 * 後端把每筆帳款的 amount_paid 沿 帳款→FeeAllocation→FeeReceipt→交接批
 * 鏈路分解為五桶；本模組負責「桶 → 顯示 tag」的唯一對照表，供逐筆明細與
 * 月繳總表共用（含點擊跳轉目標：現金桶跳結算交接、網銀桶跳對帳工作區）。
 */
import type { Schema } from '@/api/_generated/typed'
import type { FeeWorkspaceKey } from '@/components/fees/workspace/feesNavigation'

export type FeeSettlement = Schema<'FeeRecordSettlementOut'>

export type SettlementBucketKey = keyof FeeSettlement

export interface SettlementTagDef {
  key: SettlementBucketKey
  label: string
  tagType: 'success' | 'warning' | 'info' | 'primary' | 'danger'
  /** 點擊跳轉目標（null＝純顯示不可點） */
  jump: { ws: FeeWorkspaceKey; view: string } | null
}

/** Maker-Checker 語序：會計登錄 → 待老闆簽收 → 老闆已簽收；網銀為對帳銷帳 */
export const SETTLEMENT_TAGS: SettlementTagDef[] = [
  {
    key: 'cash_confirmed',
    label: '現金已簽收',
    tagType: 'success',
    jump: { ws: 'settlement', view: 'handover' },
  },
  {
    key: 'cash_submitted',
    label: '現金待簽收',
    tagType: 'warning',
    jump: { ws: 'settlement', view: 'handover' },
  },
  {
    key: 'cash_registered',
    label: '現金已登錄',
    tagType: 'info',
    jump: { ws: 'settlement', view: 'handover' },
  },
  {
    key: 'bank_reconciled',
    label: '網銀已銷帳',
    tagType: 'primary',
    jump: { ws: 'billing', view: 'matching' },
  },
  // 改版前存量（只有繳費流水、無收據）：顯示提醒即可，無對應工作區可跳
  { key: 'unreceipted', label: '未立據（存量）', tagType: 'danger', jump: null },
]

export interface ActiveSettlementTag extends SettlementTagDef {
  amount: number
}

/** 只回傳金額 > 0 的桶（依 SETTLEMENT_TAGS 順序），無資料回空陣列 */
export function activeSettlementTags(
  settlement: FeeSettlement | null | undefined,
): ActiveSettlementTag[] {
  if (!settlement) return []
  return SETTLEMENT_TAGS.flatMap((def) => {
    const amount = settlement[def.key] ?? 0
    return amount > 0 ? [{ ...def, amount }] : []
  })
}

/** 多筆 settlement 逐桶加總（月繳總表 scope 內合計用） */
export function sumSettlements(
  list: Array<FeeSettlement | null | undefined>,
): FeeSettlement {
  const total: FeeSettlement = {
    cash_registered: 0,
    cash_submitted: 0,
    cash_confirmed: 0,
    bank_reconciled: 0,
    unreceipted: 0,
  }
  for (const s of list) {
    if (!s) continue
    for (const key of Object.keys(total) as SettlementBucketKey[]) {
      total[key] += s[key] ?? 0
    }
  }
  return total
}
