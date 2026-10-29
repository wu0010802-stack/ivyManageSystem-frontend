/**
 * 學生檔案連結。tab 用現行一級頁籤 key（見 components/student/studentProfileTabs.ts）；
 * sub 是頁籤內區塊（如教務紀錄 › 出席＝tab 'records' + sub 'attendance'）。
 * 舊 key（如 tab 'attendance'）檔案頁仍會對照轉址，但站內連結請直接用現行 key。
 */
export function buildStudentProfileLink(studentId: unknown, tab?: string, sub?: string) {
  const id = Number(studentId)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    name: 'student-profile',
    params: { id },
    query: tab ? (sub ? { tab, sub } : { tab }) : {},
  }
}
