/**
 * 公開報名頁表單卡片標題組裝。
 * 規則：取主標題（去掉「｜」後的副標），僅在有活動日期時接「 · 日期」，
 * 避免後端未提供 event_date_label 時殘留尾部「 · 」。
 */
export function buildFormCardTitle(rawTitle: string, eventDate: string): string {
  const base = (rawTitle || '').split('｜')[0]
  return eventDate ? `${base} · ${eventDate}` : base
}
