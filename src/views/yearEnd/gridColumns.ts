/** 年終 grid 獎金欄開關（單一來源，元件與測試共用）。 */
// 多租戶：UI 偏好走 tenantStorage wrapper（單租戶模式 key 與改造前逐字相同，DEV-12）。
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'

export const BONUS_COL_KEYS = [
  'APPRAISAL_HALF_BONUS_FIRST', 'APPRAISAL_HALF_BONUS_SECOND',
  'SEMESTER_DIVIDEND_FIRST', 'SEMESTER_DIVIDEND_SECOND',
  'AFTER_CLASS_AWARD', 'TEACHING_EXTRA',
  'EXCESS_ENROLLMENT', 'FESTIVAL_DIFF', 'CUSTOM',
] as const

export type BonusColKey = (typeof BONUS_COL_KEYS)[number]

/** 9 個獎金 key → 中文標籤（單一來源；YearEndGridView 與 GridRowDetailDrawer 共用）。 */
export const SPECIAL_BONUS_LABELS: Record<string, string> = {
  APPRAISAL_HALF_BONUS_FIRST: '考核上',
  APPRAISAL_HALF_BONUS_SECOND: '考核下',
  SEMESTER_DIVIDEND_FIRST: '紅利上',
  SEMESTER_DIVIDEND_SECOND: '紅利下',
  AFTER_CLASS_AWARD: '才藝鼓勵',
  TEACHING_EXTRA: '教課獎勵',
  EXCESS_ENROLLMENT: '超額',
  FESTIVAL_DIFF: '節慶差額',
  CUSTOM: '其他',
}

/**
 * 7 個有 BE provenance provider（`GET /provenance/{key}`）的正向獎金 key
 * （批次 2b-2 Task 2-6 已建好，見 task-7-brief.md）。不含 FESTIVAL_DIFF/CUSTOM
 * ——這兩個 key 呼叫 getProvenance 會 400/KeyError，故 GridRowDetailDrawer 的
 * 「怎麼算的」下鑽只對本清單內的 key 顯示展開按鈕。
 */
export const PROVENANCE_BONUS_KEYS = new Set<string>(
  BONUS_COL_KEYS.filter((k) => k !== 'FESTIVAL_DIFF' && k !== 'CUSTOM'),
)

const LS_KEY = 'ye-grid-visible-bonus-cols'

/** 讀取使用者勾選要顯示的獎金欄（預設全不顯示——摘要表零橫捲）。 */
export function loadVisibleBonusCols(): Set<string> {
  try {
    const raw = tenantGetItem(LS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((k) => (BONUS_COL_KEYS as readonly string[]).includes(k)) : [])
  } catch {
    return new Set()
  }
}

export function saveVisibleBonusCols(cols: Set<string>): void {
  tenantSetItem(LS_KEY, JSON.stringify([...cols]))
}
