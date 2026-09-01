// SPEC-017「人數變化」頁籤純邏輯：快照對照列表、趨勢圖資料、名冊差集。

export interface HeadcountCellDto {
  classroom_id: number | null
  class_name: string | null
  grade_name: string | null
  total: number
  male: number
  female: number
  on_leave: number
  delta_total: number | null
}

export interface SnapshotEntryDto {
  snapshot_date: string
  snapshot_type: string
  source: string
  captured_at: string
  school: HeadcountCellDto
  classes: HeadcountCellDto[]
}

export interface RosterMemberDto {
  student_id: number
  student_name: string
  classroom_id: number | null
  class_name: string | null
  lifecycle_status_at: string
}

export interface ComparisonRow {
  snapshot_date: string
  snapshot_type: string
  source: string
  school_total: number
  school_delta: number | null
  cells: Record<number, { total: number; delta: number | null } | undefined>
}

/** 班級對照欄：以 classroom_id（唯一鍵）識別，label 取該班最後一次出現的 class_name。
 *
 * `classroom_id` 而非 `class_name` 才是穩定識別碼——classrooms 的唯一鍵是
 * (tenant, 學年, 學期, name)，跨學年同名班（例：每年都有「小班」）是不同 id，
 * 用名字當 key 會讓同一序列裡的兩個「小班」互相覆蓋人數（fix round 2, finding #1）。
 */
export interface ClassColumn {
  id: number
  label: string
}

export const classColumnNames = (snapshots: SnapshotEntryDto[]): ClassColumn[] => {
  const order: number[] = []
  const seen = new Set<number>()
  const labelById = new Map<number, string>()
  for (const s of snapshots) {
    for (const c of s.classes) {
      if (c.classroom_id == null) continue
      if (!seen.has(c.classroom_id)) {
        seen.add(c.classroom_id)
        order.push(c.classroom_id)
      }
      // 每次出現都覆寫 → 最後一次出現的 class_name 勝出（防改名/刪班冗餘副本漂移）
      labelById.set(c.classroom_id, c.class_name ?? `#${c.classroom_id}`)
    }
  }
  return order.map((id) => ({ id, label: labelById.get(id) ?? `#${id}` }))
}

export const buildComparisonRows = (snapshots: SnapshotEntryDto[]): ComparisonRow[] =>
  snapshots.map((s) => {
    const cells: ComparisonRow['cells'] = {}
    for (const c of s.classes) {
      if (c.classroom_id == null) continue
      cells[c.classroom_id] = {
        total: c.total,
        delta: c.delta_total,
      }
    }
    return {
      snapshot_date: s.snapshot_date,
      snapshot_type: s.snapshot_type,
      source: s.source,
      school_total: s.school.total,
      school_delta: s.school.delta_total,
      cells,
    }
  })

export const buildTrendChartData = (
  snapshots: SnapshotEntryDto[],
  selectedClassIds: number[],
): { labels: string[]; datasets: { label: string; data: (number | null)[] }[] } => {
  const labels = snapshots.map((s) => s.snapshot_date)
  const datasets: { label: string; data: (number | null)[] }[] = [
    { label: '全校', data: snapshots.map((s) => s.school.total) },
  ]
  const labelById = new Map(classColumnNames(snapshots).map((c) => [c.id, c.label]))
  for (const id of selectedClassIds) {
    datasets.push({
      label: labelById.get(id) ?? `#${id}`,
      data: snapshots.map((s) => {
        const hit = s.classes.find((c) => c.classroom_id === id)
        return hit ? hit.total : null
      }),
    })
  }
  return { labels, datasets }
}

/** headcount-changes 查詢區間：快照對照表語意為「(前一快照, 本快照]」，
 * 但 API 的 date_from/date_to 是雙閉區間——直接傳 (前快照日, 本快照日) 會讓
 * 快照日當天的事件同時落進前後兩個相鄰區間，drawer 顯示重複（fix round 2,
 * finding #2）。date_from 補一天即可對齊 (from, to] 語意；純日期字串運算走
 * Date 物件處理跨月/跨年進位，不手動拆字串。
 */
export const changeQueryRange = (
  from: string,
  to: string,
): { date_from: string; date_to: string } => {
  const d = new Date(`${from}T00:00:00`)
  d.setDate(d.getDate() + 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return { date_from: `${yyyy}-${mm}-${dd}`, date_to: to }
}

export const diffRosters = (
  before: RosterMemberDto[],
  after: RosterMemberDto[],
): {
  joined: RosterMemberDto[]
  left: RosterMemberDto[]
  moved: { member: RosterMemberDto; fromClass: string | null; toClass: string | null }[]
} => {
  const beforeById = new Map(before.map((m) => [m.student_id, m]))
  const afterById = new Map(after.map((m) => [m.student_id, m]))
  const joined = after.filter((m) => !beforeById.has(m.student_id))
  const left = before.filter((m) => !afterById.has(m.student_id))
  const moved: { member: RosterMemberDto; fromClass: string | null; toClass: string | null }[] = []
  for (const m of after) {
    const prev = beforeById.get(m.student_id)
    if (prev && prev.classroom_id !== m.classroom_id) {
      moved.push({ member: m, fromClass: prev.class_name, toClass: m.class_name })
    }
  }
  return { joined, left, moved }
}
