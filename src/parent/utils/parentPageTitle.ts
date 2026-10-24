/**
 * 家長端 `document.title` 的唯一組字來源（SPEC-020 CT-M-03）。
 *
 * LINE MINI App 的內建 header 直接顯示頁面 `<title>`。那條 header 本身已標示
 * App 身分，且寬度有限——再掛「- 常春藤家長」不是被截斷，就是把真正有意義的
 * 頁名擠出可視範圍。外部瀏覽器沒有內建 header，後綴仍是必要的識別。
 *
 * 家長端有兩處寫 title（`main.ts` 的品牌載入回呼、`router.ts` 的 beforeEach），
 * 兩處都必須經過本函式：否則會出現「切頁時有後綴、品牌載完又被改成沒後綴」
 * 這種閃動。
 */
import { getBranding } from '@/composables/useTenantBranding'

import { isInLineClient } from './lineClient'

/**
 * @param pageTitle 路由 `meta.title`，可為空字串。
 * @returns 該情境下應該套用的完整標題。
 */
export function buildParentDocumentTitle(pageTitle: string): string {
  const appTitle = getBranding().titles.parent_short

  // 頁名缺漏（例如 meta 沒設 title）時退回園所名稱，不留空標題：
  // MINI App header 會把空標題渲染成一片空白，看起來像頁面壞掉。
  if (!pageTitle) return appTitle

  // 頁名本身就是園所名稱時不重複串接。
  if (pageTitle === appTitle) return appTitle

  return isInLineClient() ? pageTitle : `${pageTitle} - ${appTitle}`
}
