import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  domainBus,
  STUDENT_EVENTS,
  RECORD_EVENTS,
  ATTENDANCE_EVENTS,
} from '@/utils/domainBus'

describe('domainBus', () => {
  beforeEach(() => {
    // domainBus 是 module 級單例，每個 test 開頭清乾淨避免污染
    domainBus.all.clear()
  })

  it('emit → on：handler 接收到 payload', () => {
    const handler = vi.fn()
    domainBus.on(STUDENT_EVENTS.UPDATED, handler)
    domainBus.emit(STUDENT_EVENTS.UPDATED, { id: 1, patch: { name: 'A' } })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ id: 1, patch: { name: 'A' } })
  })

  it('off 後不再收到事件', () => {
    const handler = vi.fn()
    domainBus.on(STUDENT_EVENTS.CREATED, handler)
    domainBus.off(STUDENT_EVENTS.CREATED, handler)
    domainBus.emit(STUDENT_EVENTS.CREATED, { id: 9 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('多個 handler 同時收到同一事件', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    domainBus.on(ATTENDANCE_EVENTS.CHANGED, h1)
    domainBus.on(ATTENDANCE_EVENTS.CHANGED, h2)
    domainBus.emit(ATTENDANCE_EVENTS.CHANGED, { date: '2026-05-17', classroom_id: 3 })
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('emit 不會誤觸發其他事件名稱的 handler', () => {
    const studentHandler = vi.fn()
    const recordHandler = vi.fn()
    domainBus.on(STUDENT_EVENTS.DELETED, studentHandler)
    domainBus.on(RECORD_EVENTS.DELETED, recordHandler)
    domainBus.emit(STUDENT_EVENTS.DELETED, { id: 5 })
    expect(studentHandler).toHaveBeenCalledTimes(1)
    expect(recordHandler).not.toHaveBeenCalled()
  })

  it('STUDENT_EVENTS / RECORD_EVENTS / ATTENDANCE_EVENTS 為 Object.freeze 常數對應正確字串', () => {
    expect(STUDENT_EVENTS.UPDATED).toBe('student:updated')
    expect(STUDENT_EVENTS.CREATED).toBe('student:created')
    expect(STUDENT_EVENTS.DELETED).toBe('student:deleted')
    expect(STUDENT_EVENTS.TRANSFERRED).toBe('student:transferred')
    expect(STUDENT_EVENTS.LIFECYCLE_CHANGED).toBe('student:lifecycle-changed')
    expect(RECORD_EVENTS.CREATED).toBe('student-record:created')
    expect(RECORD_EVENTS.UPDATED).toBe('student-record:updated')
    expect(RECORD_EVENTS.DELETED).toBe('student-record:deleted')
    expect(ATTENDANCE_EVENTS.CHANGED).toBe('attendance:changed')
    expect(Object.isFrozen(STUDENT_EVENTS)).toBe(true)
    expect(Object.isFrozen(RECORD_EVENTS)).toBe(true)
    expect(Object.isFrozen(ATTENDANCE_EVENTS)).toBe(true)
  })

  it('使用通配符 "*" 監聽所有事件（mitt 特性）', () => {
    const wildcardHandler = vi.fn()
    domainBus.on('*', wildcardHandler)
    domainBus.emit(STUDENT_EVENTS.CREATED, { id: 1 })
    domainBus.emit(ATTENDANCE_EVENTS.CHANGED, { date: '2026-05-17' })
    expect(wildcardHandler).toHaveBeenCalledTimes(2)
    expect(wildcardHandler).toHaveBeenNthCalledWith(1, STUDENT_EVENTS.CREATED, { id: 1 })
    expect(wildcardHandler).toHaveBeenNthCalledWith(2, ATTENDANCE_EVENTS.CHANGED, { date: '2026-05-17' })
  })
})
