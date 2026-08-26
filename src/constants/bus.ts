import { NAVIGATION_MANIFEST, type NavigationManifest } from '@/constants/navigation/manifest'
import { PERMISSION_NAMES } from '@/constants/permissions'

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
  // 「今日」不是冗字：`excuse_reason` 只存在於 `bus_trip_stops`（當日站點）的語境，
  // 名單表上寫「請假」行政容易誤讀成長期請假。與司機端（ivy-7a）議定的統一文案。
  leave: '今日請假',
  parent: '家長取消',
  admin: '後台排除',
}

/**
 * `excuse_reason` 轉顯示文案。
 *
 * - **缺值**（null／undefined）→ `fallback`：呼叫端自己決定要說什麼。
 * - **未知值** → **原樣顯示**：管理端要看得見髒資料，把未知 enum 吞成一句通用文案
 *   等於幫後端把問題藏起來。若呼叫端（例如司機端的大字卡片）不想讓 raw enum 上畫面，
 *   請自行判斷 `EXCUSE_REASON_LABELS[reason]` 有沒有命中，而不是讓共用函式吞掉它。
 */
export function excuseReasonLabel(
  reason: string | null | undefined,
  fallback = '不搭車',
): string {
  if (!reason) return fallback
  return EXCUSE_REASON_LABELS[reason] ?? reason
}

/**
 * `BUS_IN_PROGRESS_WRITE` 的顯示名稱，**取自 navigation manifest**。
 *
 * 權限鎖的提示要叫使用者「去找管理員開這個權限」，講的名字就必須與權限編輯器上
 * 看到的逐字相同——手抄一份到頁面裡，改天 manifest 改了文案，畫面上就會指向一個
 * 權限清單裡找不到的名字。manifest 是選單／權限樹的唯一事實來源（CLAUDE.md）。
 *
 * 查不到時退回權限碼本身：寧可讓使用者看到 `BUS_IN_PROGRESS_WRITE`（至少搜尋得到），
 * 也不要顯示一個過期的中文名。
 */
function findActionLabel(manifest: NavigationManifest, code: string): string | undefined {
  const pages = [...manifest.topLevel, ...manifest.groups.flatMap((g) => [...g.pages])]
  for (const page of pages) {
    const action = page.actions?.find((a) => a.code === code)
    if (action?.label) return action.label
  }
  return undefined
}

export function busInProgressWriteLabel(): string {
  const code = PERMISSION_NAMES.BUS_IN_PROGRESS_WRITE
  return findActionLabel(NAVIGATION_MANIFEST, code) ?? code
}

/** `BUS_WRITE` 的顯示名稱，理由同上（設定頁的唯讀提示要叫得出正確的權限名）。 */
export function busWriteLabel(): string {
  const code = PERMISSION_NAMES.BUS_WRITE
  return findActionLabel(NAVIGATION_MANIFEST, code) ?? code
}
