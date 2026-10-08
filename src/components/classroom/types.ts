// 班級管理頁共用型別：ClassroomView（卡片檢視）與 ClassroomTableView（年級分組表）共用，
// 避免元件之間為了一個型別互相 import 對方的 SFC。
export interface ClassroomRow {
  id: number
  name: string
  class_code?: string | null
  school_year: number
  semester: number
  semester_label?: string
  grade_id?: number | null
  grade_name?: string
  capacity?: number
  current_count?: number
  is_active?: boolean
  head_teacher_id?: number | null
  assistant_teacher_id?: number | null
  english_teacher_id?: number | null
  art_teacher_id?: number | null
  head_teacher_name?: string | null
  assistant_teacher_name?: string | null
  english_teacher_name?: string | null
  art_teacher_name?: string | null
  student_preview?: Record<string, unknown>[]
  students?: Record<string, unknown>[]
  [key: string]: unknown
}

/** ⋯ 選單與表格 emit 的操作代號（對應卡片 ⋯ 選單的 command）。 */
export type ClassroomCommand = 'edit' | 'history' | 'disable' | 'enable'

/** 年級排序所需的最小欄位（ClassroomView 的 GradeRow 結構相容）。 */
export interface GradeLite {
  id: number
  name: string
  sort_order?: number
}
