/**
 * 銀行轉帳名冊下載（年終／考核／表外獎金共用）。
 *
 * 後端各名冊端點把「不薪轉／無銀行帳號」的人排除在銀行名冊外、另列「未列入名冊」
 * 工作表，並以 `X-Roster-Excluded-Count` header 回報人數（main.py CORS
 * expose_headers 已登記）。原本這幾處是 `<a href>` 直連，讀不到 header，HR 不知道
 * 有人沒進名冊；改走 axios 下載才能提醒。薪資月名冊（StepExport）文案不同，自己處理。
 */
import { ElMessage } from 'element-plus'
import { downloadFileWithHeaders } from '@/utils/download'

export const yearEndTransferRosterPath = (cycleId: number) =>
  `/year_end/cycles/${cycleId}/transfer_roster.xlsx`

export const appraisalTransferRosterPath = (cycleId: number) =>
  `/appraisal/cycles/${cycleId}/transfer_roster.xlsx`

/** GET /extra-bonuses/transfer-roster?period=YYYY-MM[&category=]（招生獎金另有招生活動名冊） */
export const EXTRA_BONUS_TRANSFER_ROSTER_PATH = '/extra-bonuses/transfer-roster'

/** 從 response headers（key 小寫）讀被排除人數；缺 header／非數字回 0。 */
export function rosterExcludedCount(headers: Record<string, unknown> | null | undefined): number {
  const n = Number(headers?.['x-roster-excluded-count'] ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function rosterExcludedMessage(count: number): string | null {
  if (count <= 0) return null
  return `有 ${count} 人不薪轉或未填銀行帳號，未列入銀行名冊，請見檔案內「未列入名冊」工作表另行發放`
}

/**
 * 下載轉帳名冊；成功回 true，有人被排除時另跳警示。失敗回 false（錯誤已由 download 顯示）。
 */
export async function downloadTransferRoster(
  path: string,
  fallbackName: string,
  params?: Record<string, unknown>,
): Promise<boolean> {
  const headers = await downloadFileWithHeaders(path, fallbackName, params)
  if (headers === null) return false
  const warning = rosterExcludedMessage(rosterExcludedCount(headers))
  if (warning) ElMessage.warning(warning)
  return true
}
