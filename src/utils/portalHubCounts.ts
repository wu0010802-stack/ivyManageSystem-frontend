/**
 * 教師端「今日班級待辦」計數的單一事實來源。
 *
 * 背景（2026-09-03 UI/UX 稽核 P1-01）：同一個「今天還有事嗎」在三個地方各自
 * 推導，實測互相矛盾——首頁說「尚有 3 項待完成」、班級工作台置頂條說「今日任務
 * 都完成」、快速點名抽屜說「本班學生今日皆已點名」，而同頁時段卡還列著
 * 「到園點名 (1)」。老師信哪一個都會出錯，而點名是安全相關任務。
 *
 * 根因：`sticky_next` 只由 medication 驅動（後端 `class_hub.py` 組
 * sticky_candidates 時只放 medication，自承「v1 僅 medication 有 due_at」），
 * 沒有待餵藥就回 null。把 null 當成「全部做完」，在沒有用藥委託的日子
 * （幼兒園多數日子）等於每天誤報。
 *
 * 規則：**完成 ＝ 沒有下一件排程任務（sticky_next 為 null）且四類計數皆為 0**。
 * 兩者只滿足其一時，畫面必須說「還有 N 項」，不得說「都完成」。
 */

/** 後端 class-hub `counts` 的四類待辦。多餘欄位以 index signature 容納。 */
export interface PortalHubCounts {
  attendance_pending?: number
  medications_pending?: number
  observations_pending?: number
  contact_books_pending?: number
  [key: string]: unknown
}

/** 待辦類別與顯示標籤。順序即畫面上 chip 的順序（依一天的時序）。 */
export const HUB_COUNT_DEFS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'attendance_pending', label: '到園點名' },
  { key: 'medications_pending', label: '用藥' },
  { key: 'observations_pending', label: '課堂觀察' },
  { key: 'contact_books_pending', label: '聯絡簿' },
]

/** 只回傳計數大於 0 的類別，供 chip 列渲染。 */
export function hubPendingChips(
  counts: PortalHubCounts | null | undefined,
): Array<{ key: string; label: string; count: number }> {
  return HUB_COUNT_DEFS.map((d) => ({
    ...d,
    count: Number(counts?.[d.key] ?? 0) || 0,
  })).filter((c) => c.count > 0)
}

/** 四類待辦總數。 */
export function hubPendingTotal(counts: PortalHubCounts | null | undefined): number {
  return hubPendingChips(counts).reduce((sum, c) => sum + c.count, 0)
}

/**
 * 是否可以對老師宣稱「今日任務都完成」。
 *
 * ⚠ 呼叫端不得只用 `!next` 判斷——那正是本模組要修的 bug。
 */
export function hubAllDone(
  next: unknown | null | undefined,
  counts: PortalHubCounts | null | undefined,
): boolean {
  return !next && hubPendingTotal(counts) === 0
}
