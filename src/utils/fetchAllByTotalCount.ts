/**
 * 依後端 `X-Total-Count` header 逐頁取完清單並合併（FE-F4：清單不可靜默截斷）。
 *
 * 獨立成 util（不放在 api 模組內），讓呼叫端可直接傳入 `getEmployees` 等單頁函式：
 * 只 mock 單頁函式的既有測試因此不受影響（無 header → 退回單頁）。
 */

/** 後端 GET /employees 單頁 limit 上限（api/employees.py：Query(le=500)） */
export const EMPLOYEE_PAGE_LIMIT = 500
/** 員工清單翻頁安全上限：header 異常時不無限迴圈（500 × 40 = 2 萬筆） */
export const EMPLOYEE_MAX_PAGES = 40

/** axios 會把 header 名轉小寫 */
const TOTAL_COUNT_HEADER = 'x-total-count'

type Page<T> = { data?: T[] | null; headers?: unknown } | null | undefined

export async function fetchAllByTotalCount<T, R extends Page<T>>(
  getPage: (skip: number, limit: number) => Promise<R>,
  { pageLimit, maxPages, label }: { pageLimit: number; maxPages: number; label: string },
): Promise<R> {
  const first = await getPage(0, pageLimit)
  const headers = (first?.headers ?? {}) as Record<string, unknown>
  const total = Number(headers[TOTAL_COUNT_HEADER])
  // 舊後端沒有 header（或測試替身未提供）時退回單頁
  if (!first || headers[TOTAL_COUNT_HEADER] == null || !Number.isFinite(total)) return first
  const rows: T[] = [...(first.data ?? [])]
  for (let page = 1; rows.length < total && page < maxPages; page++) {
    const next = await getPage(rows.length, pageLimit)
    if (!next?.data?.length) break
    rows.push(...next.data)
  }
  if (rows.length < total) {
    // 動態載入：api / store 模組在首屏 entry 內，靜態 import element-plus 會把整包拖進首屏
    const { ElMessage } = await import('element-plus')
    ElMessage.warning(`${label}只載入 ${rows.length} / ${total} 筆，請以搜尋縮小範圍`)
  }
  return { ...first, data: rows } as R
}
