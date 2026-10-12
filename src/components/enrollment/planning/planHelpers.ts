// 新學年預編班工作台共用的純函式（無狀態、可單元測試）。

/** 後端 date 字串 'YYYY-MM-DD' → 'YYYY/MM/DD'；空值回空字串、非預期格式原樣回傳。 */
export function formatPlanDate(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value
}
