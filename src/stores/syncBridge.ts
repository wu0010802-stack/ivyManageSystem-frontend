import { domainBus, STUDENT_EVENTS, RECORD_EVENTS } from '@/utils/domainBus'
import { useStudentStore } from './student'
import { useStudentRecordsStore } from './studentRecords'
import { useClassroomStore } from './classroom'

let initialized = false
const inFlight = new Set<string>()

/**
 * 集中訂閱 domain events，反應至各 store 的失效/patch。
 * 必須在 Pinia 註冊（app.use(createPinia())）之後呼叫一次。
 */
export function initSyncBridge() {
  if (initialized) return
  initialized = true

  const studentStore = useStudentStore()
  const recordsStore = useStudentRecordsStore()
  const classroomStore = useClassroomStore()

  function guard(eventKey: string, handler: () => void) {
    if (inFlight.has(eventKey)) return
    inFlight.add(eventKey)
    try {
      handler()
    } finally {
      inFlight.delete(eventKey)
    }
  }

  domainBus.on(STUDENT_EVENTS.UPDATED, ({ id, patch }) => {
    guard(`${STUDENT_EVENTS.UPDATED}:${id}`, () => {
      if (patch) {
        studentStore.patchLocal(
          (s: unknown) => !!(s && (s as { id: unknown }).id === id),
          () => patch as Record<string, unknown>,
        )
      }
      recordsStore.invalidateAll()
    })
  })

  domainBus.on(STUDENT_EVENTS.CREATED, () => {
    guard(STUDENT_EVENTS.CREATED, () => {
      studentStore.invalidateAll()
      classroomStore.fetchClassrooms(true)
    })
  })

  domainBus.on(STUDENT_EVENTS.DELETED, ({ id }) => {
    guard(`${STUDENT_EVENTS.DELETED}:${id}`, () => {
      studentStore.patchLocal(
        (s: unknown) => !!(s && (s as { id: unknown }).id === id),
        () => null,
      )
      recordsStore.invalidateAll()
      classroomStore.fetchClassrooms(true)
    })
  })

  domainBus.on(STUDENT_EVENTS.TRANSFERRED, ({ ids, to_classroom_id }) => {
    guard(STUDENT_EVENTS.TRANSFERRED, () => {
      if (Array.isArray(ids) && to_classroom_id != null) {
        const idSet = new Set(ids)
        studentStore.patchLocal(
          (s: unknown) => !!(s && idSet.has((s as { id: number }).id)),
          () => ({ classroom_id: to_classroom_id }),
        )
      }
      studentStore.invalidateAll()
      recordsStore.invalidateAll()
      classroomStore.fetchClassrooms(true)
    })
  })

  domainBus.on(STUDENT_EVENTS.LIFECYCLE_CHANGED, ({ id, to_status }) => {
    guard(`${STUDENT_EVENTS.LIFECYCLE_CHANGED}:${id}`, () => {
      if (to_status) {
        studentStore.patchLocal(
          (s: unknown) => !!(s && (s as { id: unknown }).id === id),
          () => ({ lifecycle_status: to_status }),
        )
      }
      studentStore.invalidateAll()
      recordsStore.invalidateAll()
    })
  })

  const recordHandler = ({ student_id }: { kind: string; student_id: number | undefined; record_id: number | undefined }) => {
    const key = `record-bust:${student_id ?? 'any'}`
    guard(key, () => {
      recordsStore.invalidateAll()
    })
  }
  domainBus.on(RECORD_EVENTS.CREATED, recordHandler)
  domainBus.on(RECORD_EVENTS.UPDATED, recordHandler)
  domainBus.on(RECORD_EVENTS.DELETED, recordHandler)
}

export function _resetSyncBridgeForTests() {
  initialized = false
  inFlight.clear()
  domainBus.all.clear()
}
