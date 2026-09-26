/**
 * 學期輪值表網格純邏輯（SPEC-026 §2.5）。
 *
 * 鎖定：
 * - fromRotation → toDocumentBody 可往返；cells 以 row_index 指向 rows 陣列
 * - 刪除職務列會一併刪除該列的格子；刪除週次同理
 * - 週次產生只取週一、標籤補零
 * - 缺職務名稱或班別時 toDocumentBody 必須 throw（不可送出半成品）
 * - 差異彙總：unchanged 不列入分組；skip 依原因分計
 */
import { describe, it, expect } from 'vitest'
import {
  addRow,
  cellKey,
  fromRotation,
  generateWeeks,
  groupChangesByWeek,
  issueSeverityByCell,
  mergeWeeks,
  removeRow,
  removeWeek,
  setCell,
  snapshotKey,
  summarizeChanges,
  toDocumentBody,
  type ApplyChange,
  type RotationOut,
} from '../dutyRotationGrid'

const rotation = (): RotationOut => ({
  id: 1,
  school_year: 115,
  semester: 1,
  name: '115 上教師值勤表',
  default_head_shift_type_id: 20,
  default_assistant_shift_type_id: 5,
  last_applied_at: null,
  last_applied_by: null,
  rows: [
    { id: 11, label: '早車', teacher_role: 'assistant', shift_type_id: 6, sort_order: 1 },
    { id: 10, label: '早值', teacher_role: 'head', shift_type_id: 1, sort_order: 0 },
  ],
  weeks: [
    { id: 2, week_start_date: '2026-09-21', label: '06' },
    { id: 1, week_start_date: '2026-09-14', label: '05' },
  ],
  cells: [
    { week_start_date: '2026-09-14', row_id: 11, classroom_id: 101 },
    { week_start_date: '2026-09-21', row_id: 10, classroom_id: 102 },
  ],
  issues: [],
  classrooms: [],
  reapply_hint: { pending: false, from_week_start: null, affected_count: 0 },
})

describe('fromRotation / toDocumentBody', () => {
  it('rows 依 sort_order、weeks 依日期排序，並可往返', () => {
    const state = fromRotation(rotation())
    expect(state.rows.map((r) => r.label)).toEqual(['早值', '早車'])
    expect(state.weeks.map((w) => w.label)).toEqual(['05', '06'])
    const body = toDocumentBody(state)
    expect(body.rows.map((r) => [r.label, r.sort_order])).toEqual([['早值', 0], ['早車', 1]])
    expect(body.cells).toEqual([
      { week_start_date: '2026-09-14', row_index: 1, classroom_id: 101 },
      { week_start_date: '2026-09-21', row_index: 0, classroom_id: 102 },
    ])
  })

  it('職務缺班別時 throw', () => {
    const state = addRow(fromRotation(rotation()), 'assistant')
    expect(() => toDocumentBody(state)).toThrow(/班別|名稱/)
  })
})

describe('編輯操作', () => {
  it('setCell 設定與清除', () => {
    const s0 = fromRotation(rotation())
    const uid = s0.rows[0].uid
    const s1 = setCell(s0, '2026-09-14', uid, 103)
    expect(s1.cells[cellKey('2026-09-14', uid)]).toBe(103)
    const s2 = setCell(s1, '2026-09-14', uid, null)
    expect(cellKey('2026-09-14', uid) in s2.cells).toBe(false)
    expect(s0.cells[cellKey('2026-09-14', uid)]).toBeUndefined()
  })

  it('removeRow 一併刪除該列格子', () => {
    const s0 = fromRotation(rotation())
    const bus = s0.rows.find((r) => r.label === '早車')!
    const s1 = removeRow(s0, bus.uid)
    expect(s1.rows.map((r) => r.label)).toEqual(['早值'])
    expect(Object.keys(s1.cells).some((k) => k.endsWith(`|${bus.uid}`))).toBe(false)
  })

  it('removeWeek 一併刪除該週格子', () => {
    const s1 = removeWeek(fromRotation(rotation()), '2026-09-14')
    expect(s1.weeks.map((w) => w.week_start_date)).toEqual(['2026-09-21'])
    expect(Object.keys(s1.cells).some((k) => k.startsWith('2026-09-14|'))).toBe(false)
  })
})

describe('週次', () => {
  it('generateWeeks 只取區間內的週一，標籤補零', () => {
    expect(generateWeeks('2026-09-16', '2026-10-05', 5)).toEqual([
      { week_start_date: '2026-09-21', label: '05' },
      { week_start_date: '2026-09-28', label: '06' },
      { week_start_date: '2026-10-05', label: '07' },
    ])
  })

  it('mergeWeeks 保留既有標籤、依日期排序、不重複', () => {
    const merged = mergeWeeks(
      [{ week_start_date: '2026-09-21', label: '預' }],
      [
        { week_start_date: '2026-09-14', label: '01' },
        { week_start_date: '2026-09-21', label: '02' },
      ]
    )
    expect(merged).toEqual([
      { week_start_date: '2026-09-14', label: '01' },
      { week_start_date: '2026-09-21', label: '預' },
    ])
  })
})

describe('問題標示與差異彙總', () => {
  it('issueSeverityByCell 以 row_id 對應到 uid；error 蓋過 warning', () => {
    const s = fromRotation(rotation())
    const map = issueSeverityByCell(
      [
        { code: 'CLASS_MISSING_TEACHER', severity: 'warning', message: 'w', week_start_date: '2026-09-14', row_id: 11, classroom_id: 101, employee_id: null },
        { code: 'DUP_ROLE_IN_WEEK', severity: 'error', message: 'e', week_start_date: '2026-09-14', row_id: 11, classroom_id: 101, employee_id: null },
      ],
      s.rows
    )
    expect(map.get(cellKey('2026-09-14', 'r11'))).toBe('error')
  })

  it('summarizeChanges 與 groupChangesByWeek', () => {
    const base = { employee_name: 'A', from_shift_type_id: null, to_shift_type_id: 6, label: '早車' }
    const changes: ApplyChange[] = [
      { ...base, employee_id: 1, week_start_date: '2026-09-14', action: 'create', skip_reason: null },
      { ...base, employee_id: 2, week_start_date: '2026-09-14', action: 'unchanged', skip_reason: null },
      { ...base, employee_id: 3, week_start_date: '2026-09-21', action: 'skip', skip_reason: 'manual' },
      { ...base, employee_id: 4, week_start_date: '2026-09-21', action: 'skip', skip_reason: 'finalized' },
    ]
    expect(summarizeChanges(changes)).toEqual({
      create: 1, update: 0, removed: 0, unchanged: 1, manual: 1, finalized: 1, recorded: 0,
    })
    const groups = groupChangesByWeek(changes)
    expect(groups.map((g) => [g.week, g.items.length])).toEqual([['2026-09-14', 1], ['2026-09-21', 2]])
  })

  it('snapshotKey 對內容變化敏感', () => {
    const s = fromRotation(rotation())
    expect(snapshotKey(s)).toBe(snapshotKey(fromRotation(rotation())))
    expect(snapshotKey(setCell(s, '2026-09-21', s.rows[1].uid, 999))).not.toBe(snapshotKey(s))
  })
})
