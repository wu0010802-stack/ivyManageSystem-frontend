import mitt, { type Emitter } from 'mitt'

/**
 * 跨 store / view 的 domain event bus。
 * 用於讓班級、學生、學生紀錄等模組在資料異動時彼此通知。
 *
 * Event 清單（payload schema 以 JSDoc 註記）:
 *  - 'student:updated'          { id, patch }
 *  - 'student:created'          { id, classroom_id }
 *  - 'student:deleted'          { id }
 *  - 'student:transferred'      { ids, from_classroom_id, to_classroom_id }
 *  - 'student:lifecycle-changed'{ id, from_status, to_status }
 *  - 'student-record:created'   { kind, student_id, record_id }
 *  - 'student-record:updated'   { kind, student_id, record_id, patch }
 *  - 'student-record:deleted'   { kind, student_id, record_id }
 *  - 'attendance:changed'       { date, classroom_id }
 *
 * kind ∈ 'incident' | 'assessment' | 'change_log'
 */

export const STUDENT_EVENTS = Object.freeze({
  UPDATED: 'student:updated',
  CREATED: 'student:created',
  DELETED: 'student:deleted',
  TRANSFERRED: 'student:transferred',
  LIFECYCLE_CHANGED: 'student:lifecycle-changed',
} as const)

export const RECORD_EVENTS = Object.freeze({
  CREATED: 'student-record:created',
  UPDATED: 'student-record:updated',
  DELETED: 'student-record:deleted',
} as const)

export const ATTENDANCE_EVENTS = Object.freeze({
  CHANGED: 'attendance:changed',
} as const)

export type DomainEventMap = {
  /** 學生資料更新；patch 為後端 echo 的更新欄位或原始 payload */
  'student:updated': { id: number; patch: unknown }
  /** 學生新增；classroom_id 可能為 null（學生尚未分班）*/
  'student:created': { id: number; classroom_id: number | null }
  /**
   * 學生刪除。
   * 注意：部分 .vue emit 站點取 row?.id（可能 undefined），故 id 允許 undefined。
   * @loosened row?.id 在 ClassroomStudentDrawer / StudentListPanel 為 number | undefined
   */
  'student:deleted': { id: number | undefined }
  /** 學生批次轉班 */
  'student:transferred': { ids: number[]; from_classroom_id: number | null; to_classroom_id: number }
  /** 學生生命週期狀態變更（畢業 / 轉出 / lifecycle transition） */
  'student:lifecycle-changed': { id: number; from_status: string | null; to_status: string | null }
  /** 學生紀錄新增（kind ∈ 'incident' | 'assessment' | 'change_log'） */
  'student-record:created': { kind: string; student_id: number | undefined; record_id: number | undefined }
  /**
   * 學生紀錄更新。
   * @loosened patch 欄位型別為 unknown，允許不同 kind 的 data 結構差異。
   */
  'student-record:updated': { kind: string; student_id: number | undefined; record_id: number; patch: unknown }
  /** 學生紀錄刪除 */
  'student-record:deleted': { kind: string; student_id: number | undefined; record_id: number }
  /** 出勤異動（用於觸發 AttendanceSection 重新載入） */
  'attendance:changed': { date: unknown; classroom_id: unknown }
}

export const domainBus: Emitter<DomainEventMap> = mitt<DomainEventMap>()
