import mitt from 'mitt'

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
 *
 * kind ∈ 'incident' | 'assessment' | 'change_log'
 */
export const domainBus = mitt()

export const STUDENT_EVENTS = Object.freeze({
  UPDATED: 'student:updated',
  CREATED: 'student:created',
  DELETED: 'student:deleted',
  TRANSFERRED: 'student:transferred',
  LIFECYCLE_CHANGED: 'student:lifecycle-changed',
})

export const RECORD_EVENTS = Object.freeze({
  CREATED: 'student-record:created',
  UPDATED: 'student-record:updated',
  DELETED: 'student-record:deleted',
})
