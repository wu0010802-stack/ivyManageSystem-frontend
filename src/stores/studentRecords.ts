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

type RecordKind = 'incident' | 'assessment' | 'change_log'

const KIND_HANDLERS: Record<RecordKind, {
  create: (data: unknown) => Promise<unknown>
  update: (id: number, data: unknown) => Promise<unknown>
  delete: (id: number) => Promise<unknown>
}> = {
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

// 動態附加 mutation actions 的 store 型別
type StoreWithMutations = ReturnType<typeof baseStore> & {
  _mutationActionsAttached?: boolean
  invalidateByStudent: (studentId: number) => void
  invalidateByKind: (kind: RecordKind) => void
  createRecord: (kind: RecordKind, payload: Record<string, unknown>) => Promise<Record<string, unknown>>
  updateRecord: (kind: RecordKind, id: number, payload: Record<string, unknown>) => Promise<Record<string, unknown>>
  deleteRecord: (kind: RecordKind, id: number, opts?: { student_id?: number }) => Promise<void>
}

export function useStudentRecordsStore() {
  const store = baseStore() as unknown as StoreWithMutations

  if (!store._mutationActionsAttached) {
    Object.assign(store, buildMutationActions(store))
    store._mutationActionsAttached = true
  }
  return store
}

function buildMutationActions(store: StoreWithMutations) {
  return {
    invalidateByStudent(studentId: number) {
      store.patchLocal(
        (item: unknown) => !!(item && (item as { student_id: unknown }).student_id === studentId),
        () => ({}),
      )
      store.invalidateAll()
    },

    invalidateByKind(kind: RecordKind) {
      store.patchLocal(
        (item: unknown) => !!(item && (item as { type: unknown }).type === kind),
        () => ({}),
      )
      store.invalidateAll()
    },

    async createRecord(kind: RecordKind, payload: Record<string, unknown>) {
      const handler = KIND_HANDLERS[kind]
      if (!handler) throw new Error(`unknown record kind: ${kind}`)
      const res = await handler.create(payload) as { data?: Record<string, unknown> } | null
      const data = res?.data || {}
      const studentId = data.student_id ?? payload.student_id
      domainBus.emit(RECORD_EVENTS.CREATED, {
        kind,
        student_id: studentId as number | undefined,
        record_id: data.id as number | undefined,
      })
      return data
    },

    async updateRecord(kind: RecordKind, id: number, payload: Record<string, unknown>) {
      const handler = KIND_HANDLERS[kind]
      if (!handler) throw new Error(`unknown record kind: ${kind}`)
      const res = await handler.update(id, payload) as { data?: Record<string, unknown> } | null
      const data = res?.data || {}
      domainBus.emit(RECORD_EVENTS.UPDATED, {
        kind,
        student_id: (data.student_id ?? payload.student_id) as number | undefined,
        record_id: id,
        patch: data,
      })
      return data
    },

    async deleteRecord(kind: RecordKind, id: number, { student_id }: { student_id?: number } = {}) {
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
