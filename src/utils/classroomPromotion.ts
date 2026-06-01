import { normalizeSchoolYear } from '@/utils/academic'

/** 升班對話框逐班草稿（前端編輯用，欄位為 buildPromotionPayload 所需的子集）。 */
export interface PromotionRowDraft {
    source_classroom_id: number
    target_name: string
    target_grade_id: number | null
    copy_teachers: boolean
    move_students: boolean
    excluded: boolean
}

export interface PromotionTermDraft {
    source_school_year: number
    source_semester: number
    target_school_year: number
    target_semester: number
}

export interface PromotionClassroomPayload {
    source_classroom_id: number
    target_name: string | null
    target_grade_id: number | null
    copy_teachers: boolean
    move_students: boolean
}

export interface PromotionPayload extends PromotionTermDraft {
    classrooms: PromotionClassroomPayload[]
}

/** 無目標年級 = 畢業（不建新班）。清空目標年級即代表該班畢業。 */
export const isGraduationRow = (row: { target_grade_id: number | null }): boolean =>
    !row.target_grade_id

/**
 * 組裝送後端 /classrooms/promote-academic-year[/preview] 的 payload。
 * - 排除列（excluded）不送出。
 * - 畢業列（無目標年級）target_name 一律送 null（後端不建班）。
 * - copy_teachers / move_students 反映逐班開關（不再寫死 true）。
 */
export const buildPromotionPayload = (
    term: PromotionTermDraft,
    rows: PromotionRowDraft[],
): PromotionPayload => ({
    source_school_year: normalizeSchoolYear(term.source_school_year),
    source_semester: term.source_semester,
    target_school_year: normalizeSchoolYear(term.target_school_year),
    target_semester: term.target_semester,
    classrooms: rows
        .filter((row) => !row.excluded)
        .map((row) => ({
            source_classroom_id: row.source_classroom_id,
            target_name: isGraduationRow(row) ? null : row.target_name || null,
            target_grade_id: row.target_grade_id,
            copy_teachers: row.copy_teachers,
            move_students: row.move_students,
        })),
})
