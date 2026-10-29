import type { RecurrenceRule } from './types'

/**
 * 行事曆事件表單的值（新增／編輯共用）。
 * 欄位與後端 EventCreate／EventUpdate 對齊；`id` 只用於編輯，不會進送出內容。
 */
export interface CalendarEventFormValues {
  id: number | null
  title: string
  description: string
  event_date: string
  end_date: string | null
  event_type: string
  is_all_day: boolean
  start_time: string
  end_time: string
  location: string
  recurrence_rule: RecurrenceRule | null
  visibility: string
  category: string
  academic_year: number | null
  semester: string | null
  week_no: number | null
  owner_employee_id: number | null
}

/** 負責人下拉的選項來源（員工 store 的精簡 shape）。 */
export interface EmployeeOption { id: number; name: string; employee_id?: string }

/** GET /events/{id} 回傳中與表單相關的欄位（全部選填，缺的欄位用表單預設值補）。 */
export interface CalendarEventDetailSource {
  id: number
  title: string
  event_date: string
  event_type: string
  is_all_day: boolean
  description?: string | null
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  recurrence_rule?: RecurrenceRule | null
  visibility?: string | null
  category?: string | null
  academic_year?: number | null
  semester?: string | null
  week_no?: number | null
  owner_employee_id?: number | null
}

export function createEmptyEventForm(): CalendarEventFormValues {
  return {
    id: null,
    title: '',
    description: '',
    event_date: '',
    end_date: null,
    event_type: 'general',
    is_all_day: true,
    start_time: '',
    end_time: '',
    location: '',
    recurrence_rule: null,
    // 手動建立預設 parent（與後端相容預設一致＝改版前行為）；
    // UI 會對 parent 顯示明顯警示，送出前再確認一次
    visibility: 'parent',
    category: 'general',
    academic_year: null,
    semester: null,
    week_no: null,
    owner_employee_id: null,
  }
}

/** 把單筆事件資料轉成表單值（編輯前必須用 GET /events/{id} 的完整資料，feed 是精簡 shape）。 */
export function eventDetailToFormValues(detail: CalendarEventDetailSource): CalendarEventFormValues {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description || '',
    event_date: detail.event_date,
    end_date: detail.end_date || null,
    event_type: detail.event_type,
    is_all_day: detail.is_all_day,
    start_time: detail.start_time || '',
    end_time: detail.end_time || '',
    location: detail.location || '',
    recurrence_rule: detail.recurrence_rule ?? null,
    visibility: detail.visibility || 'parent',
    category: detail.category || 'general',
    academic_year: detail.academic_year ?? null,
    semester: detail.semester ?? null,
    week_no: detail.week_no ?? null,
    owner_employee_id: detail.owner_employee_id ?? null,
  }
}

/**
 * 表單 → POST／PUT /events 的送出內容。
 *
 * 契約鎖定：欄位集合與空值轉換必須與改版前 CalendarView.saveEvent 逐字相同
 * （空字串→null、全天事件不送時間）；`requires_acknowledgment` 不在這裡——表單未管理
 * 此欄，只有新增時由呼叫端補預設值，編輯絕不可送出，否則會覆寫既有事件的簽閱設定。
 */
export function buildEventPayload(form: CalendarEventFormValues) {
  return {
    title: form.title,
    description: form.description || null,
    event_date: form.event_date,
    end_date: form.end_date || null,
    event_type: form.event_type,
    is_all_day: form.is_all_day,
    start_time: form.is_all_day ? null : (form.start_time || null),
    end_time: form.is_all_day ? null : (form.end_time || null),
    location: form.location || null,
    recurrence_rule: form.recurrence_rule || null,
    visibility: form.visibility,
    category: form.category,
    academic_year: form.academic_year ?? null,
    semester: form.semester || null,
    week_no: form.week_no ?? null,
    owner_employee_id: form.owner_employee_id ?? null,
  }
}

export type CalendarEventPayload = ReturnType<typeof buildEventPayload>

/**
 * 送出前的最後防線（與表單 rules 同一套判斷）：回傳第一個問題的說明，沒問題回 null。
 * 結束日期早於開始日期後端同樣會拒絕（400），這裡先擋可少一趟來回。
 */
export function eventFormProblem(form: CalendarEventFormValues): string | null {
  if (!form.title.trim()) return '請輸入標題'
  if (!form.event_date) return '請選擇開始日期'
  if (form.end_date && form.end_date < form.event_date) return '結束日期不可早於開始日期'
  return null
}

/** 「進階設定」裡有幾項不是預設值（用來決定是否預設展開，以及收合時的摘要）。 */
export function countAdvancedFilled(form: CalendarEventFormValues): number {
  let n = 0
  if (form.category && form.category !== 'general') n++
  if (form.academic_year != null) n++
  if (form.semester) n++
  if (form.week_no != null) n++
  if (form.owner_employee_id != null) n++
  return n
}
