import { getStudentRecordsTimeline } from '@/api/studentRecords'
import {
  createIncident as apiCreateIncident,
  updateIncident as apiUpdateIncident,
  deleteIncident as apiDeleteIncident,
} from '@/api/studentIncidents'
import {
  createAssessment as apiCreateAssessment,
  updateAssessment as apiUpdateAssessment,
  deleteAssessment as apiDeleteAssessment,
} from '@/api/studentAssessments'
import {
  createChangeLog as apiCreateChangeLog,
  updateChangeLog as apiUpdateChangeLog,
  deleteChangeLog as apiDeleteChangeLog,
} from '@/api/studentChangeLogs'
import { createKeyedFetchStore } from './_createKeyedFetchStore'
import { domainBus, RECORD_EVENTS } from '@/utils/domainBus'

const baseStore = createKeyedFetchStore('studentRecords', getStudentRecordsTimeline, {
  ttl: 2 * 60 * 1000,
  errorMsg: '學生紀錄載入失敗',
})

const KIND_HANDLERS = {
  incident: {
    create: apiCreateIncident,
    update: apiUpdateIncident,
    delete: apiDeleteIncident,
  },
  assessment: {
    create: apiCreateAssessment,
    update: apiUpdateAssessment,
    delete: apiDeleteAssessment,
  },
  change_log: {
    create: apiCreateChangeLog,
    update: apiUpdateChangeLog,
    delete: apiDeleteChangeLog,
  },
}

export function useStudentRecordsStore() {
  const store = baseStore()

  if (!store._mutationActionsAttached) {
    Object.assign(store, buildMutationActions(store))
    store._mutationActionsAttached = true
  }
  return store
}

function buildMutationActions(store) {
  return {
    invalidateByStudent(studentId) {
      store.patchLocal(
        (item) => item && item.student_id === studentId,
        () => ({}),
      )
      store.invalidateAll()
    },

    invalidateByKind(kind) {
      store.patchLocal(
        (item) => item && item.type === kind,
        () => ({}),
      )
      store.invalidateAll()
    },

    async createRecord(kind, payload) {
      const handler = KIND_HANDLERS[kind]
      if (!handler) throw new Error(`unknown record kind: ${kind}`)
      const res = await handler.create(payload)
      const data = res?.data || {}
      const studentId = data.student_id ?? payload.student_id
      domainBus.emit(RECORD_EVENTS.CREATED, {
        kind,
        student_id: studentId,
        record_id: data.id,
      })
      return data
    },

    async updateRecord(kind, id, payload) {
      const handler = KIND_HANDLERS[kind]
      if (!handler) throw new Error(`unknown record kind: ${kind}`)
      const res = await handler.update(id, payload)
      const data = res?.data || {}
      domainBus.emit(RECORD_EVENTS.UPDATED, {
        kind,
        student_id: data.student_id ?? payload.student_id,
        record_id: id,
        patch: data,
      })
      return data
    },

    async deleteRecord(kind, id, { student_id } = {}) {
      const handler = KIND_HANDLERS[kind]
      if (!handler) throw new Error(`unknown record kind: ${kind}`)
      await handler.delete(id)
      domainBus.emit(RECORD_EVENTS.DELETED, {
        kind,
        student_id,
        record_id: id,
      })
    },
  }
}
