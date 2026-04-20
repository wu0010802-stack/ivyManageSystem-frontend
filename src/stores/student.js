import {
  getStudents,
  createStudent as apiCreateStudent,
  updateStudent as apiUpdateStudent,
  graduateStudent as apiGraduateStudent,
  bulkTransferStudents as apiBulkTransferStudents,
  transitionStudentLifecycle as apiTransitionLifecycle,
} from '@/api/students'
import { createKeyedFetchStore } from './_createKeyedFetchStore'
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'

const baseStore = createKeyedFetchStore('student', getStudents, {
  errorMsg: '學生資料載入失敗',
})

export function useStudentStore() {
  const store = baseStore()

  if (!store._mutationActionsAttached) {
    Object.assign(store, buildMutationActions(store))
    store._mutationActionsAttached = true
  }
  return store
}

function buildMutationActions(store) {
  return {
    async createStudent(payload) {
      const res = await apiCreateStudent(payload)
      const created = res?.data ?? {}
      domainBus.emit(STUDENT_EVENTS.CREATED, {
        id: created.id,
        classroom_id: created.classroom_id ?? payload.classroom_id ?? null,
      })
      return created
    },

    async updateStudent(id, payload) {
      const snapshots = store.patchLocal(
        (s) => s && s.id === id,
        () => payload,
      )
      try {
        const res = await apiUpdateStudent(id, payload)
        const data = res?.data ?? null
        domainBus.emit(STUDENT_EVENTS.UPDATED, { id, patch: data ?? payload })
        return data
      } catch (err) {
        store.rollbackLocal(snapshots)
        throw err
      }
    },

    async graduateStudent(id, payload) {
      const target = store.byId(id)
      const fromStatus = target?.lifecycle_status || null
      const res = await apiGraduateStudent(id, payload)
      domainBus.emit(STUDENT_EVENTS.LIFECYCLE_CHANGED, {
        id,
        from_status: fromStatus,
        to_status: payload?.status === '已轉出' ? 'transferred' : 'graduated',
      })
      return res?.data
    },

    async bulkTransfer({ student_ids, target_classroom_id, source_classroom_id = null }) {
      const res = await apiBulkTransferStudents({
        student_ids,
        target_classroom_id,
      })
      domainBus.emit(STUDENT_EVENTS.TRANSFERRED, {
        ids: student_ids,
        from_classroom_id: source_classroom_id,
        to_classroom_id: target_classroom_id,
      })
      return res?.data
    },

    async transitionLifecycle(id, payload) {
      const target = store.byId(id)
      const fromStatus = target?.lifecycle_status || null
      const res = await apiTransitionLifecycle(id, payload)
      domainBus.emit(STUDENT_EVENTS.LIFECYCLE_CHANGED, {
        id,
        from_status: fromStatus,
        to_status: payload?.to_status ?? null,
      })
      return res?.data
    },
  }
}
