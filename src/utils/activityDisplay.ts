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
