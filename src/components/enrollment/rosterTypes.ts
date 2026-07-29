/** 在籍花名冊共用型別（供 EnrollmentRosterTable / EnrollmentRosterDialog / rosterFilter 共用）。 */

export interface RosterStudent {
  seq?: number
  student_id: number
  name: string
  status_tag?: string | null
}

export interface RosterClass {
  classroom_id: number
  class_number: number
  grade_name: string
  class_name: string
  head_teacher_name?: string | null
  assistant_teacher_name?: string | null
  art_teacher_name?: string | null
  students: RosterStudent[]
  total: number
  old_count: number
  new_count: number
}

export interface GradeSummary {
  grade_name: string
  class_numbers: number[]
  total: number
  old_count: number
  new_count: number
}

export interface Roster {
  school_year: number
  semester: number
  generated_date: string
  classes: RosterClass[]
  grade_summaries: GradeSummary[]
  grand_total: number
  old_grand_total: number
  new_grand_total: number
  staff_by_role: Record<string, { name: string }[]>
}
