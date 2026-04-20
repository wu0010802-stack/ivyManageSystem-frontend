import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/students', () => ({
  getStudents: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  graduateStudent: vi.fn(),
  bulkTransferStudents: vi.fn(),
  transitionStudentLifecycle: vi.fn(),
}))

import {
  getStudents,
  createStudent,
  updateStudent,
  graduateStudent,
  bulkTransferStudents,
} from '@/api/students'
import { useStudentStore } from '@/stores/student'
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'

function makePage(items) {
  return { data: { items, total: items.length } }
}

describe('useStudentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    domainBus.all.clear()
  })

  it('caches per-key fetch and deduplicates concurrent calls', async () => {
    let resolveFn
    getStudents.mockReturnValue(new Promise((r) => { resolveFn = r }))

    const store = useStudentStore()
    const p1 = store.fetchByKey({ classroom_id: 1 })
    const p2 = store.fetchByKey({ classroom_id: 1 })
    expect(getStudents).toHaveBeenCalledTimes(1)

    resolveFn(makePage([{ id: 10, name: 'Amy' }]))
    await Promise.all([p1, p2])
    expect(store.items({ classroom_id: 1 })).toHaveLength(1)
    expect(store.byId(10)?.name).toBe('Amy')
  })

  it('updateStudent patches local cache and emits student:updated', async () => {
    getStudents.mockResolvedValue(makePage([{ id: 5, name: 'Old', classroom_id: 1 }]))
    updateStudent.mockResolvedValue({ data: { id: 5, name: 'New', classroom_id: 1 } })

    const store = useStudentStore()
    await store.fetchByKey({ classroom_id: 1 })

    const listener = vi.fn()
    domainBus.on(STUDENT_EVENTS.UPDATED, listener)
    await store.updateStudent(5, { name: 'New' })

    expect(store.byId(5)?.name).toBe('New')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
  })

  it('updateStudent rolls back local patch if API fails', async () => {
    getStudents.mockResolvedValue(makePage([{ id: 5, name: 'Old' }]))
    updateStudent.mockRejectedValue(new Error('boom'))

    const store = useStudentStore()
    await store.fetchByKey({})
    await expect(store.updateStudent(5, { name: 'Broken' })).rejects.toThrow('boom')
    expect(store.byId(5)?.name).toBe('Old')
  })

  it('bulkTransfer emits student:transferred with ids and classrooms', async () => {
    bulkTransferStudents.mockResolvedValue({ data: {} })
    const store = useStudentStore()
    const listener = vi.fn()
    domainBus.on(STUDENT_EVENTS.TRANSFERRED, listener)

    await store.bulkTransfer({ student_ids: [1, 2], target_classroom_id: 9, source_classroom_id: 3 })
    expect(listener).toHaveBeenCalledWith({
      ids: [1, 2],
      from_classroom_id: 3,
      to_classroom_id: 9,
    })
  })

  it('graduateStudent emits lifecycle-changed', async () => {
    getStudents.mockResolvedValue(makePage([{ id: 7, lifecycle_status: 'active' }]))
    graduateStudent.mockResolvedValue({ data: {} })

    const store = useStudentStore()
    await store.fetchByKey({})
    const listener = vi.fn()
    domainBus.on(STUDENT_EVENTS.LIFECYCLE_CHANGED, listener)

    await store.graduateStudent(7, { status: '已畢業' })
    expect(listener).toHaveBeenCalledWith({
      id: 7,
      from_status: 'active',
      to_status: 'graduated',
    })
  })

  it('createStudent emits student:created', async () => {
    createStudent.mockResolvedValue({ data: { id: 99, classroom_id: 2 } })
    const listener = vi.fn()
    domainBus.on(STUDENT_EVENTS.CREATED, listener)

    const store = useStudentStore()
    await store.createStudent({ name: 'Bob', classroom_id: 2 })
    expect(listener).toHaveBeenCalledWith({ id: 99, classroom_id: 2 })
  })

  it('invalidateAll resets fetchedAt so next fetch hits API', async () => {
    getStudents.mockResolvedValue(makePage([{ id: 1 }]))
    const store = useStudentStore()
    await store.fetchByKey({ classroom_id: 1 })
    expect(getStudents).toHaveBeenCalledTimes(1)

    // Cache hit
    await store.fetchByKey({ classroom_id: 1 })
    expect(getStudents).toHaveBeenCalledTimes(1)

    store.invalidateAll()
    await store.fetchByKey({ classroom_id: 1 })
    expect(getStudents).toHaveBeenCalledTimes(2)
  })
})
