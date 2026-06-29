/**
 * unread 計數刷新 TTL 判斷（純函式，供 ParentLayout 節流用）。
 *
 * 避免每次路由切換都重打 unread API：lastTs 為上次成功刷新時間（ms epoch，
 * 0 表示尚未刷新）；距今未達 ttlMs 則跳過。
 */
export function shouldRefreshUnread(lastTs: number, now: number, ttlMs: number): boolean {
  if (lastTs === 0) return true
  return now - lastTs >= ttlMs
}
