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
  cells: Record<string, { total: number; delta: number | null } | undefined>
}

export const classColumnNames = (snapshots: SnapshotEntryDto[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of snapshots) {
    for (const c of s.classes) {
      const name = c.class_name ?? `#${c.classroom_id}`
      if (!seen.has(name)) {
        seen.add(name)
        out.push(name)
      }
    }
  }
  return out
}

export const buildComparisonRows = (snapshots: SnapshotEntryDto[]): ComparisonRow[] =>
  snapshots.map((s) => {
    const cells: ComparisonRow['cells'] = {}
    for (const c of s.classes) {
      cells[c.class_name ?? `#${c.classroom_id}`] = {
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
  selectedClasses: string[],
): { labels: string[]; datasets: { label: string; data: (number | null)[] }[] } => {
  const labels = snapshots.map((s) => s.snapshot_date)
  const datasets: { label: string; data: (number | null)[] }[] = [
    { label: '全校', data: snapshots.map((s) => s.school.total) },
  ]
  for (const name of selectedClasses) {
    datasets.push({
      label: name,
      data: snapshots.map((s) => {
        const hit = s.classes.find((c) => (c.class_name ?? `#${c.classroom_id}`) === name)
        return hit ? hit.total : null
      }),
    })
  }
  return { labels, datasets }
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
    if (prev && prev.class_name !== m.class_name) {
      moved.push({ member: m, fromClass: prev.class_name, toClass: m.class_name })
    }
  }
  return { joined, left, moved }
}
