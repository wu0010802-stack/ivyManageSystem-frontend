/**
 * 結薪覆核：班級人數差距（在籍 vs 節慶目標人數）的純函式。
 *
 * 資料來源是 GET /salaries/records 每筆的 `breakdown`（後端
 * services/salary/breakdown_enrollment.py）：
 * - `breakdown.enrollment`：本人當班導的班（target／overtime_target 為該班節慶目標人數與超額門檻）
 * - `breakdown.assistant.classes`：副班導／美師所帶各班（共用副班導已改用 shared_assistant 目標）
 *
 * - `breakdown.school`：節慶獎金看全園比例的人（主管／辦公室／未帶班教保，後端
 *   services/salary/festival_basis.py 依引擎分支判定）→ 全園在籍 vs 全園目標，排在最前；
 *   其他沒帶班的人（時薪、廚工、停用…）後端也附全園人數但 `basis: null`＝僅供參考，
 *   不是節慶獎金依據（isSchoolReference），不算進「人數未達目標」
 *
 * ⚠ 班級列是「班級」的人數差距：目標一律是該班依有無副班導查的班級目標（同班的人看到同一組數字），
 * 不是個人節慶獎金的計算基準——引擎對共用副班導與美師改用共用目標、主管看全園人數、
 * 發放月按期間逐月累計、新班有保障比例。個人金額以「節慶獎金」欄位明細為準。
 */

export type HeadcountRole = 'head_teacher' | 'assistant_teacher' | 'art_teacher'
export type SchoolBasis = 'supervisor' | 'office' | 'unassigned'

export interface ClassHeadcount {
    /** class＝班級人數；school＝全園人數（主管／辦公室／未帶班教保的節慶依據，或不帶班者的參考） */
    scope: 'class' | 'school'
    /** scope='school' 時：節慶依據；null＝不帶班、只供參考。scope='class' 恆 null */
    schoolBasis: SchoolBasis | null
    classroomName: string
    gradeName: string | null
    role: HeadcountRole
    enrollment: number
    target: number | null
    overtimeTarget: number | null
    isShared: boolean
    multiHead: boolean
    snapshotDate: string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const optInt = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

const ROLES: readonly HeadcountRole[] = ['head_teacher', 'assistant_teacher', 'art_teacher']
const SCHOOL_BASES: readonly SchoolBasis[] = ['supervisor', 'office', 'unassigned']

export function headcountsOf(row: Record<string, unknown>): ClassHeadcount[] {
    const bd = row.breakdown
    if (!isObj(bd)) return []
    const out: ClassHeadcount[] = []
    const school = bd.school
    if (isObj(school) && (school.basis === null || SCHOOL_BASES.includes(school.basis as SchoolBasis))) {
        out.push({
            scope: 'school',
            schoolBasis: school.basis === null ? null : (school.basis as SchoolBasis),
            classroomName: '全園',
            gradeName: null,
            role: 'head_teacher',
            enrollment: optInt(school.total) ?? 0,
            target: optInt(school.target),
            overtimeTarget: null,
            isShared: false,
            multiHead: false,
            snapshotDate: typeof school.snapshot_date === 'string' ? school.snapshot_date : null,
        })
    }
    const enr = bd.enrollment
    if (isObj(enr) && typeof enr.classroom_name === 'string') {
        out.push({
            scope: 'class',
            schoolBasis: null,
            classroomName: enr.classroom_name,
            gradeName: typeof enr.grade_name === 'string' ? enr.grade_name : null,
            role: 'head_teacher',
            enrollment: optInt(enr.total) ?? 0,
            target: optInt(enr.target),
            overtimeTarget: optInt(enr.overtime_target),
            isShared: false,
            multiHead: enr.multi_head === true,
            snapshotDate: typeof enr.snapshot_date === 'string' ? enr.snapshot_date : null,
        })
    }
    const asst = bd.assistant
    const classes = isObj(asst) && Array.isArray(asst.classes) ? asst.classes : []
    for (const c of classes) {
        if (!isObj(c) || typeof c.classroom_name !== 'string') continue
        const role = ROLES.includes(c.role as HeadcountRole) ? (c.role as HeadcountRole) : 'assistant_teacher'
        out.push({
            scope: 'class',
            schoolBasis: null,
            classroomName: c.classroom_name,
            gradeName: typeof c.grade_name === 'string' ? c.grade_name : null,
            role,
            enrollment: optInt(c.total) ?? 0,
            target: optInt(c.target),
            overtimeTarget: optInt(c.overtime_target),
            isShared: c.is_shared_assistant === true,
            multiHead: false,
            snapshotDate: isObj(enr) && typeof enr.snapshot_date === 'string' ? enr.snapshot_date : null,
        })
    }
    return out
}

export function primaryHeadcount(row: Record<string, unknown>): ClassHeadcount | null {
    return headcountsOf(row)[0] ?? null
}

/** 不帶班者的全園人數：只供參考，不是本人節慶獎金的人數依據。 */
export function isSchoolReference(h: ClassHeadcount | null): boolean {
    return !!h && h.scope === 'school' && h.schoolBasis === null
}

/** 在籍 − 目標；目標未設定（null 或 0）回 null。 */
export function headcountGap(h: ClassHeadcount | null): number | null {
    if (!h || !h.target) return null
    return h.enrollment - h.target
}

export function gapText(gap: number | null): string {
    if (gap === null) return '—'
    if (gap === 0) return '達標'
    return gap > 0 ? `+${gap}` : `−${Math.abs(gap)}`
}

export function ratioText(h: ClassHeadcount | null): string {
    if (!h || !h.target) return '—'
    return `${Math.round((h.enrollment / h.target) * 1000) / 10}%`
}

export function overtimeText(h: ClassHeadcount | null): string {
    if (!h || !h.overtimeTarget) return '—'
    const over = h.enrollment - h.overtimeTarget
    if (over > 0) return `超額 ${over} 人`
    if (over === 0) return '剛好到門檻，未超額'
    return `未超額，還差 ${-over} 人`
}

export const SCHOOL_BASIS_LABEL: Record<SchoolBasis, string> = {
    supervisor: '主管',
    office: '辦公室',
    unassigned: '未帶班教保',
}

export const ROLE_LABEL: Record<HeadcountRole, string> = {
    head_teacher: '班導',
    assistant_teacher: '副班導',
    art_teacher: '美師',
}
