/** 在籍花名冊純函式篩選器（依年級 / 班級過濾 + 重算 summaries / 總計）。 */
import type { Roster } from './rosterTypes'

export function filterRoster(
  roster: Roster,
  gradeFilter: string[],
  classFilter: number[],
): Roster {
  let classes = roster.classes
  if (gradeFilter.length) classes = classes.filter(c => gradeFilter.includes(c.grade_name))
  if (classFilter.length) classes = classes.filter(c => classFilter.includes(c.classroom_id))
  // 無篩選條件直接回原 roster（identity shortcut）
  if (classes === roster.classes) return roster

  // 重算年級 grade_summaries
  const gradeMap = new Map<string, {
    grade_name: string
    class_numbers: number[]
    total: number
    old_count: number
    new_count: number
  }>()
  for (const c of classes) {
    const g = gradeMap.get(c.grade_name) ?? {
      grade_name: c.grade_name,
      class_numbers: [],
      total: 0,
      old_count: 0,
      new_count: 0,
    }
    g.class_numbers.push(c.class_number)
    g.total += c.total
    g.old_count += c.old_count
    g.new_count += c.new_count
    gradeMap.set(c.grade_name, g)
  }

  return {
    ...roster,
    classes,
    grade_summaries: [...gradeMap.values()],
    grand_total: classes.reduce((s, c) => s + c.total, 0),
    old_grand_total: classes.reduce((s, c) => s + c.old_count, 0),
    new_grand_total: classes.reduce((s, c) => s + c.new_count, 0),
  }
}
