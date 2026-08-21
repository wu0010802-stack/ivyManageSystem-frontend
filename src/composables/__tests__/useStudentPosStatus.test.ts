import { describe, it, expect } from 'vitest'
import { useStudentPosStatus, type PosStudentCallInput } from '../useStudentPosStatus'

describe('useStudentPosStatus', () => {
  const student = { id: 1 }

  it('無任何 call → status=unpicked', () => {
    const result = useStudentPosStatus(student, [])
    expect(result.status).toBe('unpicked')
  })

  it('同一學生有 completed call → status=guardian_picked', () => {
    const calls: PosStudentCallInput[] = [{ student_id: 1, status: 'completed' }]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('guardian_picked')
  })

  it('pending call 仍算 unpicked（還沒完成）', () => {
    const calls: PosStudentCallInput[] = [{ student_id: 1, status: 'pending' }]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('unpicked')
  })

  it('acknowledged call 仍算 unpicked（還沒完成）', () => {
    const calls: PosStudentCallInput[] = [{ student_id: 1, status: 'acknowledged' }]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('unpicked')
  })

  it('cancelled call 不算完成，仍算 unpicked', () => {
    const calls: PosStudentCallInput[] = [{ student_id: 1, status: 'cancelled' }]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('unpicked')
  })

  it('completed ＋ pending 並存（已放學後再次通知）→ 以進行中為準，回到 unpicked', () => {
    const calls: PosStudentCallInput[] = [
      { student_id: 1, status: 'completed' },
      { student_id: 1, status: 'pending' },
    ]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('unpicked')
  })

  it('completed ＋ acknowledged 並存（再次通知已被老師收到）→ 仍是 unpicked', () => {
    const calls: PosStudentCallInput[] = [
      { student_id: 1, status: 'completed' },
      { student_id: 1, status: 'acknowledged' },
    ]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('unpicked')
  })

  it('completed ＋ 其他學生的 pending 並存 → 本人仍是 guardian_picked', () => {
    const calls: PosStudentCallInput[] = [
      { student_id: 1, status: 'completed' },
      { student_id: 2, status: 'pending' },
    ]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('guardian_picked')
  })

  it('其他學生的 completed call 不影響本人狀態', () => {
    const calls: PosStudentCallInput[] = [{ student_id: 2, status: 'completed' }]
    const result = useStudentPosStatus(student, calls)
    expect(result.status).toBe('unpicked')
  })

  describe('sortWeight — unpicked 全部排在已完成狀態之前', () => {
    it('混合陣列依 sortWeight 排序後，unpicked 都在 guardian_picked 之前', () => {
      const students = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
        { id: 4, name: 'D' },
      ]
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'completed' },
        { student_id: 3, status: 'completed' },
      ]
      const results = students
        .map(s => ({ ...s, ...useStudentPosStatus(s, calls) }))
        .sort((a, b) => a.sortWeight - b.sortWeight)

      expect(results.map(r => r.status)).toEqual([
        'unpicked',
        'unpicked',
        'guardian_picked',
        'guardian_picked',
      ])
      expect(results.map(r => r.id).slice(0, 2).sort()).toEqual([2, 4])
    })

    it('unpicked 的 sortWeight 小於 guardian_picked', () => {
      const unpicked = useStudentPosStatus(student, [])
      const picked = useStudentPosStatus(student, [{ student_id: 1, status: 'completed' }])
      expect(unpicked.sortWeight).toBeLessThan(picked.sortWeight)
    })
  })
})
