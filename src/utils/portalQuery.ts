/**
 * 教師端 deep link 的 query → 頁面狀態轉換。
 *
 * 首頁班級卡與搜尋面板都會帶 `?classroom_id=` / `?log_date=` 過來，但接收端一律沒讀，
 * 多班老師因此會開到錯的班（誤點名、誤寫聯絡簿）。這裡集中處理，避免每頁各寫一份
 * 而且各寫各的。
 */

// 與 vue-router 的 LocationQuery 對齊：Record<string, string | null | (string | null)[]>
type QueryValue = string | null | undefined | (string | null)[]
type QueryLike = Record<string, QueryValue>

function firstOf(v: QueryValue): string | null {
  const raw = Array.isArray(v) ? v[0] : v
  return typeof raw === 'string' && raw !== '' ? raw : null
}

/**
 * 從 query 取班級 id，並驗證它確實在老師自己的班級清單裡。
 *
 * 一定要驗證：直接採用網址上的值等於讓任何人用網址切到別班，後端雖然會 403，
 * 但畫面會變成一片載入失敗而不是明確的降級。查無對應時回 fallback（通常是第一班）。
 */
export function pickClassroomIdFromQuery(
  query: QueryLike,
  classrooms: { classroom_id?: number | null }[],
  fallback: number | null = null,
): number | null {
  const raw = firstOf(query?.classroom_id)
  if (raw !== null) {
    const wanted = Number(raw)
    if (
      Number.isInteger(wanted) &&
      classrooms.some((c) => c.classroom_id === wanted)
    ) {
      return wanted
    }
  }
  return fallback
}

/** 從 query 取 YYYY-MM-DD 日期；格式不符或缺漏時回 fallback。 */
export function pickDateFromQuery(
  query: QueryLike,
  key: string,
  fallback: string,
): string {
  const raw = firstOf(query?.[key])
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback
}
