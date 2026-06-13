/**
 * 班級卡「保留座位（準新生）」：intake-plan 一次回全年級 rows，
 * 頁面層打一次 API 後以此表分發各卡，避免每卡一發的 N+1。
 * 注意：reserved_count 是「年級」維度（同年級多班共用同一數字）。
 */
export interface IntakePlanRowLite {
  grade_id: number
  reserved_count: number
  [key: string]: unknown
}

export function mapReservedByGrade(rows: IntakePlanRowLite[]): Record<number, number> {
  return Object.fromEntries(rows.map((r) => [r.grade_id, r.reserved_count]))
}

export function reservedCountFor(
  map: Record<number, number>,
  classroom: { grade_id?: number | null },
): number {
  if (classroom.grade_id == null) return 0
  return map[classroom.grade_id] ?? 0
}
