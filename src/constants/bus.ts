/**
 * 娃娃車跨頁共用的顯示字典。
 *
 * 只放**兩處以上**會用到的對照（CLAUDE.md：相同邏輯出現兩次就提取）。
 * 單一頁面專屬的字典（例如班次卡片的五態徽章、歷史頁的班次狀態）留在
 * 各自元件內，不往這裡集中。
 */

/**
 * `bus_trip_stops.excuse_reason`（spec「異動：bus_trip_stops」）。
 *
 * 2026-08-26 第二期起 **excused 是當日不搭事實的單一來源**（第一期的
 * `on_leave` 即時衍生旗標已退場），因此「為什麼這站不接」只能靠這個欄位講清楚
 * ——監看頁與今日調度頁都要顯示，行政才分得出「家長早上按了不搭」與
 * 「後台把人排除掉」。值域外的字串一律原樣顯示，不吞掉未知原因。
 */
export const EXCUSE_REASON_LABELS: Record<string, string> = {
  leave: '請假',
  parent: '家長取消',
  admin: '後台排除',
}

/** `excuse_reason` 轉顯示文案；null／未知值回 fallback（不謊稱成已知原因）。 */
export function excuseReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '不搭車'
  return EXCUSE_REASON_LABELS[reason] ?? reason
}
