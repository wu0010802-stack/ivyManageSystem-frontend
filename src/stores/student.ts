import {
  getStudents,
  createStudent as apiCreateStudent,
  updateStudent as apiUpdateStudent,
  graduateStudent as apiGraduateStudent,
  bulkTransferStudents as apiBulkTransferStudents,
  bulkGraduateStudents as apiBulkGraduateStudents,
  transitionStudentLifecycle as apiTransitionLifecycle,
} from '@/api/students'
import { createKeyedFetchStore } from './_createKeyedFetchStore'
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'
import { submitStudentCreateWithDuplicateConfirm } from '@/utils/studentDuplicateConflict'

const baseStore = createKeyedFetchStore('student', getStudents, {
  errorMsg: '學生資料載入失敗',
})

// 動態附加 mutation actions 的 store 型別
type StoreWithMutations = ReturnType<typeof baseStore> & {
  _mutationActionsAttached?: boolean
  createStudent: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
  updateStudent: (id: number, payload: Record<string, unknown>) => Promise<unknown>
  graduateStudent: (id: number, payload: Record<string, unknown>) => Promise<unknown>
  bulkTransfer: (args: { student_ids: number[]; target_classroom_id: number; source_classroom_id?: number | null }) => Promise<unknown>
  bulkGraduate: (args: { student_ids: number[]; graduation_date: string; status: string; reason?: string | null; notes?: string | null }) => Promise<{ graduated_count?: number; skipped?: { student_id: number; reason: string }[]; succeeded_ids?: number[] }>
  transitionLifecycle: (id: number, payload: Record<string, unknown>) => Promise<unknown>
}

export function useStudentStore() {
  const store = baseStore() as unknown as StoreWithMutations

  if (!store._mutationActionsAttached) {
    Object.assign(store, buildMutationActions(store))
    store._mutationActionsAttached = true
  }
  return store
}

function buildMutationActions(store: StoreWithMutations) {
  return {
    async createStudent(payload: Record<string, unknown>) {
      // 重複建檔查重（架構評估 D4）：命中 409 時彈確認框，使用者確認後帶
      // allow_duplicate:true 重送；取消則拋出 StudentDuplicateCreateCancelled
      // （呼叫端 catch 應以 isSilentError 靜默處理，不顯示錯誤 toast）。
      const res = await submitStudentCreateWithDuplicateConfirm(apiCreateStudent, payload)
      const created = (res?.data ?? {}) as Record<string, unknown>
      domainBus.emit(STUDENT_EVENTS.CREATED, {
        id: created.id as number,
        classroom_id: (created.classroom_id ?? payload.classroom_id ?? null) as number | null,
      })
      return created
    },

    async updateStudent(id: number, payload: Record<string, unknown>) {
      const snapshots = store.patchLocal(
        (s: unknown) => !!(s && (s as { id: unknown }).id === id),
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

    async graduateStudent(id: number, payload: Record<string, unknown>) {
      const target = store.byId(id) as Record<string, unknown> | null
      const fromStatus = (target?.lifecycle_status as string) || null
      const res = await apiGraduateStudent(id, payload)
      domainBus.emit(STUDENT_EVENTS.LIFECYCLE_CHANGED, {
        id,
        from_status: fromStatus,
        to_status: payload?.status === '已轉出' ? 'transferred' : 'graduated',
      })
      return res?.data
    },

    async bulkTransfer({ student_ids, target_classroom_id, source_classroom_id = null }: { student_ids: number[]; target_classroom_id: number; source_classroom_id?: number | null }) {
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

    async bulkGraduate({ student_ids, graduation_date, status, reason = null, notes = null }: { student_ids: number[]; graduation_date: string; status: string; reason?: string | null; notes?: string | null }) {
      const res = await apiBulkGraduateStudents({ student_ids, graduation_date, status, reason, notes })
      const data = (res?.data ?? {}) as { succeeded_ids?: number[]; graduated_count?: number; skipped?: { student_id: number; reason: string }[] }
      const toStatus = status === '已轉出' ? 'transferred' : 'graduated'
      for (const id of data.succeeded_ids ?? []) {
        domainBus.emit(STUDENT_EVENTS.LIFECYCLE_CHANGED, { id, from_status: null, to_status: toStatus })
      }
      return data
    },

    async transitionLifecycle(id: number, payload: Record<string, unknown>) {
      const target = store.byId(id) as Record<string, unknown> | null
      const fromStatus = (target?.lifecycle_status as string) || null
      const res = await apiTransitionLifecycle(id, payload)
      domainBus.emit(STUDENT_EVENTS.LIFECYCLE_CHANGED, {
        id,
        from_status: fromStatus,
        to_status: (payload?.to_status as string) ?? null,
      })
      return res?.data
    },
  }
}
