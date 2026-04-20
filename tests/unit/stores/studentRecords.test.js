import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/studentRecords', () => ({
  getStudentRecordsTimeline: vi.fn(),
}))
vi.mock('@/api/studentIncidents', () => ({
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
}))
vi.mock('@/api/studentAssessments', () => ({
  createAssessment: vi.fn(),
  updateAssessment: vi.fn(),
  deleteAssessment: vi.fn(),
}))
vi.mock('@/api/studentChangeLogs', () => ({
  createChangeLog: vi.fn(),
  updateChangeLog: vi.fn(),
  deleteChangeLog: vi.fn(),
}))

import { createIncident, deleteIncident } from '@/api/studentIncidents'
import { createAssessment } from '@/api/studentAssessments'
import { createChangeLog } from '@/api/studentChangeLogs'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { domainBus, RECORD_EVENTS } from '@/utils/domainBus'

describe('useStudentRecordsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    domainBus.all.clear()
  })

  it('dispatches createRecord to correct API by kind', async () => {
    createIncident.mockResolvedValue({ data: { id: 1, student_id: 3 } })
    createAssessment.mockResolvedValue({ data: { id: 2, student_id: 3 } })
    createChangeLog.mockResolvedValue({ data: { id: 3, student_id: 3 } })

    const store = useStudentRecordsStore()
    await store.createRecord('incident', { student_id: 3 })
    await store.createRecord('assessment', { student_id: 3 })
    await store.createRecord('change_log', { student_id: 3 })

    expect(createIncident).toHaveBeenCalledTimes(1)
    expect(createAssessment).toHaveBeenCalledTimes(1)
    expect(createChangeLog).toHaveBeenCalledTimes(1)
  })

  it('emits student-record:created with kind and student id', async () => {
    createIncident.mockResolvedValue({ data: { id: 42, student_id: 7 } })
    const store = useStudentRecordsStore()
    const listener = vi.fn()
    domainBus.on(RECORD_EVENTS.CREATED, listener)

    await store.createRecord('incident', { student_id: 7, description: 'x' })
    expect(listener).toHaveBeenCalledWith({ kind: 'incident', student_id: 7, record_id: 42 })
  })

  it('deleteRecord emits with provided student_id', async () => {
    deleteIncident.mockResolvedValue({})
    const store = useStudentRecordsStore()
    const listener = vi.fn()
    domainBus.on(RECORD_EVENTS.DELETED, listener)

    await store.deleteRecord('incident', 99, { student_id: 5 })
    expect(listener).toHaveBeenCalledWith({ kind: 'incident', student_id: 5, record_id: 99 })
  })

  it('throws on unknown kind', async () => {
    const store = useStudentRecordsStore()
    await expect(store.createRecord('invalid', {})).rejects.toThrow(/unknown record kind/)
  })
})
