/**
 * 學號自然排序：115-大-8 排在 115-大-15 之前。
 *
 * Why（day-qa F17）：後端以字串排序學號，位數不一時點名名單變成 01、08、106、113…15，
 * 老師對照紙本名冊找不到人。空值排最後。
 */
export function compareStudentNo(a?: string | null, b?: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b, 'zh-Hant', { numeric: true })
}
