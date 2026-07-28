import { describe, expect, it } from 'vitest'
import {
  buildParentRecipientsPayload,
  resolveParentScope,
} from '@/utils/announcementScope'

describe('resolveParentScope', () => {
  it('空陣列 → off', () => {
    expect(resolveParentScope([])).toEqual({
      visibility: 'off', classroomIds: [], studentIds: [], preservedItems: [],
    })
  })

  it('含 all scope → all', () => {
    const r = resolveParentScope([{ scope: 'all' }, { scope: 'classroom', classroom_id: 1 }])
    expect(r.visibility).toBe('all')
  })

  it('全部為 classroom → classroom + ids', () => {
    const r = resolveParentScope([
      { scope: 'classroom', classroom_id: 1 },
      { scope: 'classroom', classroom_id: 3 },
    ])
    expect(r.visibility).toBe('classroom')
    expect(r.classroomIds).toEqual([1, 3])
  })

  it('含 student → custom，student ids 抽出、非 student rows 進 preservedItems', () => {
    const r = resolveParentScope([
      { scope: 'student', student_id: 31 },
      { scope: 'student', student_id: 42 },
      { scope: 'guardian', guardian_id: 9 },
      { scope: 'classroom', classroom_id: 2 }, // 混排班級 rows 也必須保留
    ])
    expect(r.visibility).toBe('custom')
    expect(r.studentIds).toEqual([31, 42])
    expect(r.preservedItems).toEqual([
      { scope: 'guardian', guardian_id: 9 },
      { scope: 'classroom', classroom_id: 2 },
    ])
  })
})

describe('buildParentRecipientsPayload', () => {
  it('off → 空陣列（對家長隱藏）', () => {
    expect(buildParentRecipientsPayload({ visibility: 'off', classroomIds: [], studentIds: [], preservedItems: [] })).toEqual([])
  })

  it('all → [{scope: all}]', () => {
    expect(buildParentRecipientsPayload({ visibility: 'all', classroomIds: [], studentIds: [], preservedItems: [] })).toEqual([{ scope: 'all' }])
  })

  it('classroom → classroom rows', () => {
    expect(buildParentRecipientsPayload({ visibility: 'classroom', classroomIds: [1, 3], studentIds: [], preservedItems: [] })).toEqual([
      { scope: 'classroom', classroom_id: 1 },
      { scope: 'classroom', classroom_id: 3 },
    ])
  })

  it('custom → student rows ＋ preservedItems 原樣附回（replace-all 不變量）', () => {
    expect(buildParentRecipientsPayload({
      visibility: 'custom',
      classroomIds: [],
      studentIds: [31],
      preservedItems: [{ scope: 'guardian', guardian_id: 9 }],
    })).toEqual([
      { scope: 'student', student_id: 31 },
      { scope: 'guardian', guardian_id: 9 },
    ])
  })

  it('unchanged → null（呼叫端跳過 PUT）', () => {
    expect(buildParentRecipientsPayload({ visibility: 'unchanged', classroomIds: [], studentIds: [], preservedItems: [] })).toBeNull()
  })
})
