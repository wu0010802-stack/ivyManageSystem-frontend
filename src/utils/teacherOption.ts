/**
 * 教師選項顯示字串。
 *
 * Why：只顯示姓名時，同名教師在下拉裡完全無法分辨（2026-08-14 staging：「吳逸倫」
 * 有兩筆員工，班導師指派落到與登入帳號不同的那筆，教師 Portal 因此看不到班級）。
 * 姓名保持在最前面以維持既有掃視習慣，工號／職稱作為括號補充。
 */
export interface TeacherOptionLike {
  id: number
  name: string
  employee_id?: string | null
  position?: string | null
}

export function formatTeacherOptionLabel(teacher: TeacherOptionLike): string {
  const extras = [teacher.employee_id, teacher.position]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0)
  return extras.length > 0 ? `${teacher.name}（${extras.join('·')}）` : teacher.name
}
