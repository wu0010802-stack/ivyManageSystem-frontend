/**
 * scorePreviewColumns — 26 欄分數預覽的欄位開關（單一來源，元件與測試共用）。
 *
 * 比照 `src/views/yearEnd/gridColumns.ts` 的 chips pattern：使用者可勾選要顯示
 * 的 ScoreItemCode 欄，覆寫存 localStorage；未曾覆寫時 `loadVisibleScoreColOverride`
 * 回 `null`，由呼叫端改用「有異動欄」（`computeChangedColumns`）當預設，避免 26 欄
 * 矩陣預設全展開造成橫向捲動。員工欄與合計欄不受此開關控制，恆顯示。
 */
import { ITEM_CODE_LABELS } from './scoreItemLabels'
// 多租戶：UI 偏好走 tenantStorage wrapper（單租戶模式 key 與改造前逐字相同，DEV-12）。
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'

export const SCORE_COL_LS_KEY = 'aye-score-preview-visible-cols'

const VALID_CODES = new Set(Object.keys(ITEM_CODE_LABELS))

export interface ScorePreviewItem {
  item_code: string
  delta: number
  current_db_value: number
}
export interface ScorePreviewParticipant {
  participant_id: number
  employee_name: string
  items: ScorePreviewItem[]
}

/** 讀取使用者的欄位可見覆寫；未曾覆寫過（或資料毀損）回 `null`，由呼叫端落回預設。 */
export function loadVisibleScoreColOverride(): Set<string> | null {
  try {
    const raw = tenantGetItem(SCORE_COL_LS_KEY)
    if (raw == null) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return new Set(arr.filter((k): k is string => typeof k === 'string' && VALID_CODES.has(k)))
  } catch {
    return null
  }
}

export function saveVisibleScoreColOverride(cols: Set<string>): void {
  tenantSetItem(SCORE_COL_LS_KEY, JSON.stringify([...cols]))
}

/** 回傳所有參與者中，任一列有異動（delta 與目前系統值不同、或非零）的 item_code 集合。 */
export function computeChangedColumns(participants: ScorePreviewParticipant[]): Set<string> {
  const changed = new Set<string>()
  for (const p of participants) {
    for (const it of p.items) {
      if (it.delta !== it.current_db_value || it.delta !== 0) changed.add(it.item_code)
    }
  }
  return changed
}
