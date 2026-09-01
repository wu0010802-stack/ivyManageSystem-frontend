import { describe, expect, it } from 'vitest'
import {
  buildComparisonRows,
  buildTrendChartData,
  classColumnNames,
  diffRosters,
  type RosterMemberDto,
  type SnapshotEntryDto,
} from '@/utils/enrollmentHistory'

const cell = (name: string | null, total: number, delta: number | null = null) => ({
  classroom_id: name ? name.length : null,
  class_name: name,
  grade_name: name ? `${name}年級` : null,
  total,
  male: total,
  female: 0,
  on_leave: 0,
  delta_total: delta,
})

const snap = (date: string, schoolTotal: number, classes: ReturnType<typeof cell>[], schoolDelta: number | null = null): SnapshotEntryDto => ({
  snapshot_date: date,
  snapshot_type: date.endsWith('-08-01') || date.endsWith('-02-01') ? 'semester_start' : 'month_start',
  source: 'scheduled',
  captured_at: `${date}T03:00:00`,
  school: cell(null, schoolTotal, schoolDelta),
  classes,
})

describe('classColumnNames', () => {
  it('依出現順序聯集班名（新班中途出現也要有欄）', () => {
    const s = [
      snap('2026-08-01', 3, [cell('小班', 3)]),
      snap('2026-09-01', 5, [cell('小班', 3), cell('中班', 2)]),
    ]
    expect(classColumnNames(s)).toEqual(['小班', '中班'])
  })
})

describe('buildComparisonRows', () => {
  it('school_delta 與各班 delta 直接取自 API delta_total；缺班的 cell 為 undefined', () => {
    const s = [
      snap('2026-08-01', 3, [cell('小班', 3)]),
      snap('2026-09-01', 5, [cell('小班', 3, 0), cell('中班', 2, null)], 2),
    ]
    const rows = buildComparisonRows(s)
    expect(rows[0].school_delta).toBeNull()
    expect(rows[1].school_delta).toBe(2)
    expect(rows[1].cells['小班']).toEqual({ total: 3, delta: 0 })
    expect(rows[0].cells['中班']).toBeUndefined()
  })
})

describe('buildTrendChartData', () => {
  it('全校恆為第一條 dataset；勾選班級疊加；缺快照的班補 null', () => {
    const s = [
      snap('2026-08-01', 3, [cell('小班', 3)]),
      snap('2026-09-01', 5, [cell('小班', 3), cell('中班', 2)]),
    ]
    const out = buildTrendChartData(s, ['中班'])
    expect(out.labels).toEqual(['2026-08-01', '2026-09-01'])
    expect(out.datasets[0].label).toBe('全校')
    expect(out.datasets[0].data).toEqual([3, 5])
    expect(out.datasets[1].label).toBe('中班')
    expect(out.datasets[1].data).toEqual([null, 2])
  })
})

describe('diffRosters', () => {
  const m = (id: number, cls: string | null): RosterMemberDto => ({
    student_id: id,
    student_name: `生${id}`,
    classroom_id: cls ? cls.length : null,
    class_name: cls,
    lifecycle_status_at: 'active',
  })

  it('分出 joined / left / moved 三組', () => {
    const before = [m(1, '小班'), m(2, '小班'), m(3, '中班')]
    const after = [m(2, '中班'), m(3, '中班'), m(4, '大班')]
    const d = diffRosters(before, after)
    expect(d.joined.map((x) => x.student_id)).toEqual([4])
    expect(d.left.map((x) => x.student_id)).toEqual([1])
    expect(d.moved).toEqual([
      { member: m(2, '中班'), fromClass: '小班', toClass: '中班' },
    ])
  })
})
