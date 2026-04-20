import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  graduateStudent: vi.fn(),
  bulkTransferStudents: vi.fn(),
  transitionStudentLifecycle: vi.fn(),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/api/studentRecords', () => ({
  getStudentRecordsTimeline: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))
vi.mock('@/api/studentIncidents', () => ({
  createIncident: vi.fn(), updateIncident: vi.fn(), deleteIncident: vi.fn(),
}))
vi.mock('@/api/studentAssessments', () => ({
  createAssessment: vi.fn(), updateAssessment: vi.fn(), deleteAssessment: vi.fn(),
}))
vi.mock('@/api/studentChangeLogs', () => ({
  createChangeLog: vi.fn(), updateChangeLog: vi.fn(), deleteChangeLog: vi.fn(),
}))

import { getStudents } from '@/api/students'
import { getClassrooms } from '@/api/classrooms'
import { useStudentStore } from '@/stores/student'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { domainBus, STUDENT_EVENTS, RECORD_EVENTS } from '@/utils/domainBus'
import { initSyncBridge, _resetSyncBridgeForTests } from '@/stores/syncBridge'

describe('syncBridge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    _resetSyncBridgeForTests()
  })

  it('student:updated patches store and invalidates records cache', async () => {
    getStudents.mockResolvedValue({ data: { items: [{ id: 1, name: 'Old' }], total: 1 } })
    const studentStore = useStudentStore()
    const recordsStore = useStudentRecordsStore()
    await studentStore.fetchByKey({})
    await recordsStore.fetchByKey({})

    initSyncBridge()

    domainBus.emit(STUDENT_EVENTS.UPDATED, { id: 1, patch: { name: 'New' } })
    expect(studentStore.byId(1)?.name).toBe('New')
    const recordEntry = recordsStore.getEntry({})
    expect(recordEntry.fetchedAt).toBe(0)
  })

  it('student:transferred invalidates all stores and refreshes classrooms', async () => {
    const studentStore = useStudentStore()
    const recordsStore = useStudentRecordsStore()
    await studentStore.fetchByKey({ classroom_id: 1 })
    await recordsStore.fetchByKey({})

    initSyncBridge()
    getClassrooms.mockClear()

    domainBus.emit(STUDENT_EVENTS.TRANSFERRED, {
      ids: [1, 2],
      from_classroom_id: 1,
      to_classroom_id: 2,
    })

    expect(studentStore.getEntry({ classroom_id: 1 }).fetchedAt).toBe(0)
    expect(recordsStore.getEntry({}).fetchedAt).toBe(0)
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('student-record:created invalidates records cache', async () => {
    const recordsStore = useStudentRecordsStore()
    await recordsStore.fetchByKey({ student_id: 1 })
    expect(recordsStore.getEntry({ student_id: 1 }).fetchedAt).toBeGreaterThan(0)

    initSyncBridge()
    domainBus.emit(RECORD_EVENTS.CREATED, { kind: 'incident', student_id: 1, record_id: 10 })
    expect(recordsStore.getEntry({ student_id: 1 }).fetchedAt).toBe(0)
  })

  it('initSyncBridge is idempotent', () => {
    initSyncBridge()
    const handlerCountBefore = domainBus.all.get(STUDENT_EVENTS.UPDATED)?.length || 0
    initSyncBridge()
    const handlerCountAfter = domainBus.all.get(STUDENT_EVENTS.UPDATED)?.length || 0
    expect(handlerCountAfter).toBe(handlerCountBefore)
  })
})
