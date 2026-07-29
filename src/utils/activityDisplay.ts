/**
 * 公開報名頁表單卡片標題組裝。
 * 規則：取主標題（去掉「｜」後的副標），僅在有活動日期時接「 · 日期」，
 * 避免後端未提供 event_date_label 時殘留尾部「 · 」。
 */
export function buildFormCardTitle(rawTitle: string, eventDate: string): string {
  const base = (rawTitle || '').split('｜')[0]
  return eventDate ? `${base} · ${eventDate}` : base
}

/**
 * 從可選用品清單剔除「該報名已加入」的用品，避免後台追加時重複選同一用品
 * 撞 (registration_id, supply_id) 唯一鍵。id 以字串正規化比對（number/string 皆可）。
 */
export function excludeAddedSupplies<T extends { id: number | string }>(
  supplies: T[],
  existingSupplyIds: Array<number | string>,
): T[] {
  const taken = new Set(existingSupplyIds.map((x) => String(x)))
  return supplies.filter((s) => !taken.has(String(s.id)))
}

/**
 * 報名課程的「本筆應繳」顯示。
 *
 * 課程牌價不等於目前應繳：候補、候補升正待確認與待審核狀態都尚未正式
 * 計費。只有 enrolled 才能顯示金額，其餘狀態明確標示「未計費」。
 */
export function courseBillingLabel(course: {
  status: string
  price?: number | string | null
}): string {
  if (course.status !== 'enrolled') return '未計費'
  if (course.price == null || course.price === '') return '—'
  return `$${course.price}`
}

/**
 * 估算修改報名後某課程的狀態（純函式，對應元件內 estimatedCourseStatus）。
 *
 * 邏輯（對齊後端 _attach_courses 的 update 路徑）：
 * 1. availability[name] > 0  → 'enrolled'（有空位）
 * 2. availability[name] === 0
 *    → **先**檢查本生在 queryResult.courses 是否已佔此課容量
 *      （status 'enrolled'、'promoted_pending' 或 'pending_review'）。
 *      若已佔位 → 'enrolled'（後端 update 排除自己，本生座位保留）。
 *      否則     → 'waitlist'（真正滿席，新加課程進候補）。
 * 3. availability[name] === undefined（後端不回此課）
 *    → 用 queryResult.courses 中本生原狀態；無原狀態 fallback 'enrolled'。
 * 4. availability[name] < 0（滿且不開候補，allow_waitlist=false）
 *    → **先**檢查本生原狀態（同 ===0 分支）：
 *      已 enrolled/promoted_pending/pending_review → 'enrolled'
 *      （後端 update 排除自己，本生座位保留；待審核是否計費由上游另判斷）。
 *      否則 → 'unavailable'（後端 _attach_courses 對「滿額且不開候補」fail-closed raise 400；
 *      新加此課注定失敗，回此 sentinel 讓 feePreview 的 `!== 'enrolled'` 判斷自動剔除學費，
 *      不虛報應繳金額）。
 *
 * @param courseName      課程名稱
 * @param availabilityMap GET /public/courses/availability 回傳的 map（可能為空物件）
 * @param existingCourses queryResult.courses（本生目前報名的課程列表）
 */
export function estimateCourseStatus(
  courseName: string,
  availabilityMap: Record<string, number>,
  existingCourses: Array<{ name: string; status: string }>,
): string {
  const keepsOwnSeat = (status?: string) =>
    status === 'enrolled'
    || status === 'promoted_pending'
    || status === 'pending_review'

  const remaining = availabilityMap[courseName]
  if (remaining !== undefined && remaining > 0) return 'enrolled'
  if (remaining === 0) {
    // 本生已佔此課容量 → 後端排除自己，座位保留
    const orig = existingCourses.find((c) => c.name === courseName)
    if (keepsOwnSeat(orig?.status)) {
      return 'enrolled'
    }
    return 'waitlist'
  }
  if (remaining === undefined) {
    const orig = existingCourses.find((c) => c.name === courseName)
    return orig?.status ?? 'enrolled'
  }
  // remaining < 0（滿且不開候補）：比照 ===0 分支先查本生既有座位
  const origUnavail = existingCourses.find((c) => c.name === courseName)
  if (keepsOwnSeat(origUnavail?.status)) {
    return 'enrolled'
  }
  return 'unavailable'
}
