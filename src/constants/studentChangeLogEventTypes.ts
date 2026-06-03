/**
 * 學生/班級異動紀錄 event types — 前端單一來源。
 *
 * 鏡像後端 models/student_log.py `EVENT_TYPES`（中文 7 種、順序固定，有 field_validator
 * gate + `GET /students/change-logs/options`）。event 清單以後端為權威：runtime 主來源
 * 為 `/options` API，本檔供 student 兩處的 catch fallback 與 classroom 篩選器 primary。
 *
 * 注意：與 lifecycle_status（英文狀態碼，見 @/constants/lifecycle）是**不同資料模型**，
 * 僅後端 `LIFECYCLE_TO_EVENT_TYPE` 單向對照連結，勿混用。
 * tag type（顏色）後端不提供，為前端獨有；漂移由 __tests__ 鎖定。
 */

export type ChangeLogTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

export const STUDENT_CHANGE_LOG_EVENT_TYPES = [
  '入學',
  '復學',
  '退學',
  '轉出',
  '轉入',
  '畢業',
  '休學',
] as const

export const CHANGE_LOG_TAG_TYPE: Record<string, ChangeLogTagType> = {
  入學: 'success',
  復學: 'success',
  退學: 'danger',
  轉出: 'warning',
  轉入: 'primary',
  畢業: 'info',
  休學: 'info',
}
