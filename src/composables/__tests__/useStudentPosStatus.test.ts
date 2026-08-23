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

  describe('proxy_picked（T-023：委託代理人代接）', () => {
    it('同一學生有 completed 且 request_source=proxy 的 call → status=proxy_picked', () => {
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'completed', request_source: 'proxy' },
      ]
      const result = useStudentPosStatus(student, calls)
      expect(result.status).toBe('proxy_picked')
    })

    it('completed 但 request_source 非 proxy（如 parent）仍算 guardian_picked', () => {
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'completed', request_source: 'parent' },
      ]
      const result = useStudentPosStatus(student, calls)
      expect(result.status).toBe('guardian_picked')
    })

    it('completed 且 request_source 為 null/undefined 仍算 guardian_picked（既有資料無此欄位）', () => {
      const calls: PosStudentCallInput[] = [{ student_id: 1, status: 'completed' }]
      const result = useStudentPosStatus(student, calls)
      expect(result.status).toBe('guardian_picked')
    })

    it('pending 的 proxy call 仍算 unpicked（還沒完成）', () => {
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'pending', request_source: 'proxy' },
      ]
      const result = useStudentPosStatus(student, calls)
      expect(result.status).toBe('unpicked')
    })

    it('防禦性優先權：同日同時有 proxy 與非 proxy 的 completed call（資料異常）→ proxy_picked 優先', () => {
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'completed', request_source: 'parent' },
        { student_id: 1, status: 'completed', request_source: 'proxy' },
      ]
      const result = useStudentPosStatus(student, calls)
      expect(result.status).toBe('proxy_picked')
    })

    it('proxy completed ＋ pending 並存（代理人接走後又重新發起通知）→ 以進行中為準，回到 unpicked', () => {
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'completed', request_source: 'proxy' },
        { student_id: 1, status: 'pending' },
      ]
      const result = useStudentPosStatus(student, calls)
      expect(result.status).toBe('unpicked')
    })
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

    it('混合陣列排序後，unpicked 都在已完成狀態（含 proxy_picked）之前', () => {
      const students = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
        { id: 4, name: 'D' },
      ]
      const calls: PosStudentCallInput[] = [
        { student_id: 1, status: 'completed', request_source: 'proxy' },
        { student_id: 3, status: 'completed' },
      ]
      const results = students
        .map(s => ({ ...s, ...useStudentPosStatus(s, calls) }))
        .sort((a, b) => a.sortWeight - b.sortWeight)

      expect(results.map(r => r.status).slice(0, 2)).toEqual(['unpicked', 'unpicked'])
      expect(results.map(r => r.status).slice(2)).toEqual(
        expect.arrayContaining(['guardian_picked', 'proxy_picked']),
      )
    })

    it('proxy_picked 的 sortWeight 小於 unpicked 之後、與 guardian_picked 相同', () => {
      const proxyPicked = useStudentPosStatus(student, [
        { student_id: 1, status: 'completed', request_source: 'proxy' },
      ])
      const guardianPicked = useStudentPosStatus(student, [
        { student_id: 1, status: 'completed' },
      ])
      const unpicked = useStudentPosStatus(student, [])
      expect(unpicked.sortWeight).toBeLessThan(proxyPicked.sortWeight)
      expect(proxyPicked.sortWeight).toBe(guardianPicked.sortWeight)
    })
  })
})
