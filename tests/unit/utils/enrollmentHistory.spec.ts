import { describe, expect, it } from 'vitest'
import {
  buildComparisonRows,
  buildTrendChartData,
  changeQueryRange,
  classColumnNames,
  diffRosters,
  type RosterMemberDto,
  type SnapshotEntryDto,
} from '@/utils/enrollmentHistory'

const cell = (
  id: number | null,
  name: string | null,
  total: number,
  delta: number | null = null,
) => ({
  classroom_id: id,
  class_name: name,
  grade_name: name ? `${name}年級` : null,
  total,
  male: total,
  female: 0,
  on_leave: 0,
  delta_total: delta,
})

const snap = (
  date: string,
  schoolTotal: number,
  classes: ReturnType<typeof cell>[],
  schoolDelta: number | null = null,
): SnapshotEntryDto => ({
  snapshot_date: date,
  snapshot_type: date.endsWith('-08-01') || date.endsWith('-02-01') ? 'semester_start' : 'month_start',
  source: 'scheduled',
  captured_at: `${date}T03:00:00`,
  school: cell(null, null, schoolTotal, schoolDelta),
  classes,
})

describe('classColumnNames', () => {
  it('依出現順序聯集班級 id（新班中途出現也要有欄）', () => {
    const s = [
      snap('2026-08-01', 3, [cell(101, '小班', 3)]),
      snap('2026-09-01', 5, [cell(101, '小班', 3), cell(102, '中班', 2)]),
    ]
    expect(classColumnNames(s)).toEqual([
      { id: 101, label: '小班' },
      { id: 102, label: '中班' },
    ])
  })

  it('label 取該班最後一次出現的 class_name（防改名/刪班冗餘副本漂移）', () => {
    const s = [
      snap('2026-08-01', 3, [cell(101, '小班', 3)]),
      snap('2026-09-01', 3, [cell(101, '小班（改名）', 3)]),
    ]
    expect(classColumnNames(s)).toEqual([{ id: 101, label: '小班（改名）' }])
  })

  it('撞名情境：同一序列中兩個同名不同 id 的班（跨學年撞名），各自獨立成欄', () => {
    const s = [snap('2026-08-01', 5, [cell(101, '小班', 3), cell(201, '小班', 2)])]
    expect(classColumnNames(s)).toEqual([
      { id: 101, label: '小班' },
      { id: 201, label: '小班' },
    ])
  })
})

describe('buildComparisonRows', () => {
  it('school_delta 與各班 delta 直接取自 API delta_total；缺班的 cell 為 undefined', () => {
    const s = [
      snap('2026-08-01', 3, [cell(101, '小班', 3)]),
      snap('2026-09-01', 5, [cell(101, '小班', 3, 0), cell(102, '中班', 2, null)], 2),
    ]
    const rows = buildComparisonRows(s)
    expect(rows[0].school_delta).toBeNull()
    expect(rows[1].school_delta).toBe(2)
    expect(rows[1].cells[101]).toEqual({ total: 3, delta: 0 })
    expect(rows[0].cells[102]).toBeUndefined()
  })

  it('撞名情境：同名不同 id 的兩班各自獨立成 cell，不互蓋人數', () => {
    const s = [snap('2026-08-01', 5, [cell(101, '小班', 3), cell(201, '小班', 2)])]
    const rows = buildComparisonRows(s)
    expect(rows[0].cells[101]).toEqual({ total: 3, delta: null })
    expect(rows[0].cells[201]).toEqual({ total: 2, delta: null })
  })
})

describe('buildTrendChartData', () => {
  it('全校恆為第一條 dataset；勾選班級（用 id）疊加；缺快照的班補 null', () => {
    const s = [
      snap('2026-08-01', 3, [cell(101, '小班', 3)]),
      snap('2026-09-01', 5, [cell(101, '小班', 3), cell(102, '中班', 2)]),
    ]
    const out = buildTrendChartData(s, [102])
    expect(out.labels).toEqual(['2026-08-01', '2026-09-01'])
    expect(out.datasets[0].label).toBe('全校')
    expect(out.datasets[0].data).toEqual([3, 5])
    expect(out.datasets[1].label).toBe('中班')
    expect(out.datasets[1].data).toEqual([null, 2])
  })

  it('撞名情境：同名不同 id 的兩班可分別勾選疊加，各自曲線不混淆', () => {
    const s = [snap('2026-08-01', 5, [cell(101, '小班', 3), cell(201, '小班', 2)])]
    const out = buildTrendChartData(s, [101, 201])
    expect(out.datasets[1]).toEqual({ label: '小班', data: [3] })
    expect(out.datasets[2]).toEqual({ label: '小班', data: [2] })
  })
})

describe('changeQueryRange', () => {
  it('date_from 為 from 隔天、date_to 原樣（(from, to] 半開語意）', () => {
    expect(changeQueryRange('2026-08-01', '2026-09-01')).toEqual({
      date_from: '2026-08-02',
      date_to: '2026-09-01',
    })
  })

  it('跨月邊界：月底 +1 天進位到下月 1 號', () => {
    expect(changeQueryRange('2026-08-31', '2026-09-15')).toEqual({
      date_from: '2026-09-01',
      date_to: '2026-09-15',
    })
  })

  it('跨年邊界：12/31 +1 天進位到隔年 1/1', () => {
    expect(changeQueryRange('2026-12-31', '2027-01-10')).toEqual({
      date_from: '2027-01-01',
      date_to: '2027-01-10',
    })
  })

  it('平年二月邊界：2/28 +1 天進位到 3/1', () => {
    expect(changeQueryRange('2027-02-28', '2027-03-05')).toEqual({
      date_from: '2027-03-01',
      date_to: '2027-03-05',
    })
  })

  it('閏年二月邊界：2/29 +1 天進位到 3/1', () => {
    expect(changeQueryRange('2028-02-29', '2028-03-05')).toEqual({
      date_from: '2028-03-01',
      date_to: '2028-03-05',
    })
  })
})

describe('diffRosters', () => {
  // 班級 ID 對照表（classroom_id 為穩定識別碼）
  const classroomIds: Record<string, number> = {
    小班: 101,
    中班: 102,
    大班: 103,
  }

  const m = (id: number, cls: string | null): RosterMemberDto => ({
    student_id: id,
    student_name: `生${id}`,
    classroom_id: cls ? classroomIds[cls] : null,
    class_name: cls,
    lifecycle_status_at: 'active',
  })

  it('分出 joined / left / moved 三組（用 classroom_id 判定移動，非 class_name）', () => {
    const before = [m(1, '小班'), m(2, '小班'), m(3, '中班')]
    const after = [m(2, '中班'), m(3, '中班'), m(4, '大班')]
    const d = diffRosters(before, after)
    expect(d.joined.map((x) => x.student_id)).toEqual([4])
    expect(d.left.map((x) => x.student_id)).toEqual([1])
    expect(d.moved).toEqual([
      { member: m(2, '中班'), fromClass: '小班', toClass: '中班' },
    ])
  })

  it('同 classroom_id 不變、class_name 改變（模擬改班名）→ 不出現在 moved', () => {
    const before = [m(1, '小班')]
    const after = [
      {
        student_id: 1,
        student_name: '生1',
        classroom_id: classroomIds['小班'],
        class_name: '小班（改名）',
        lifecycle_status_at: 'active',
      },
    ]
    const d = diffRosters(before, after)
    expect(d.joined).toEqual([])
    expect(d.left).toEqual([])
    expect(d.moved).toEqual([])
  })
})
