import api from './index'

/**
 * 後端列表端點的分頁契約（後端 utils/pagination.py）：
 *   帶 page → { items, total, page, page_size }
 *   不帶 page → 裸陣列（legacy 相容路徑，最多 LIST_MAX_PAGE_SIZE 筆、無 total）
 *
 * 前端一律帶 page，並在此層正規化成 PagedResult，讓頁面不必各自處理 unwrap。
 */
export interface PagedResult<T> {
  items: T[]
  /** 過濾條件下的**全量**筆數（非本頁筆數） */
  total: number
  page: number
  pageSize: number
  /** 尚有未取回的資料 → UI 應提示使用者縮小查詢範圍，而非讓人誤以為看到了全部 */
  hasMore: boolean
}

/**
 * 單次請求的最大筆數，與後端 `utils/pagination.LEGACY_LIST_CAP` 對齊。
 *
 * Why 取最大值而非典型分頁大小：這幾個管理頁是「單月全載 + 客端關鍵字過濾」，
 * 改成小頁會讓搜尋只在當頁生效（UX 退步）。取 legacy cap 等量可讓顯示資料量
 * 與改版前**逐字相同**，差別只在多拿到 total、超量時不再靜默。
 */
export const LIST_MAX_PAGE_SIZE = 5000

/** 後端未回 envelope 時（舊版後端／代理層）的容錯正規化，避免整頁空白。 */
function normalize<T>(data: unknown, requestedPage: number, requestedPageSize: number): PagedResult<T> {
  if (Array.isArray(data)) {
    return {
      items: data as T[],
      total: data.length,
      page: 1,
      pageSize: requestedPageSize,
      hasMore: false,
    }
  }
  const envelope = (data ?? {}) as Record<string, unknown>
  const items = (Array.isArray(envelope.items) ? envelope.items : []) as T[]
  const total = Number(envelope.total ?? items.length)
  const page = Number(envelope.page ?? requestedPage)
  const pageSize = Number(envelope.page_size ?? requestedPageSize)
  return { items, total, page, pageSize, hasMore: page * pageSize < total }
}

export async function fetchPagedList<T>(
  path: string,
  params: Record<string, unknown> = {},
  pageSize: number = LIST_MAX_PAGE_SIZE,
): Promise<PagedResult<T>> {
  const page = Number(params.page ?? 1)
  const res = await api.get(path, { params: { ...params, page, page_size: pageSize } })
  return normalize<T>(res.data, page, pageSize)
}
