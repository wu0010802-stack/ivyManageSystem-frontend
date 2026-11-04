/**
 * 結薪覆核：班級人數（在籍、節慶目標、較上月）的純函式。
 *
 * 「人數差距」欄＝較上月（2026-11-04 起）：本月在籍 − 上月同一班在籍（不帶班者比全園）。
 * 後端（breakdown_enrollment._resolve_prev_month）給各班／全園 `prev_total` 與
 * `breakdown.prev_month`；上月與本月同源（resolve_bonus_counts，即上月節慶獎金的人數）。
 * 不跨學年：本月是學年第一個月（8 月）時 prev_month.reason='cross_school_year'、不比較。
 * 下學期另建同名班級列時，後端以同學年同班名對回上學期那一列。
 * 在籍 − 目標（headcountGap）仍用於展開列與「人數未達目標」chip。
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
    /** 上月同一班（全園列＝上月全園）的在籍；舊後端／新班／不比較時 null */
    prevEnrollment: number | null
}

export type PrevMonthReason = 'cross_school_year' | 'unavailable'

/** breakdown.prev_month：上月是哪個月、能不能比 */
export interface PrevMonthInfo {
    year: number
    month: number
    comparable: boolean
    reason: PrevMonthReason | null
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
            prevEnrollment: optInt(school.prev_total),
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
            prevEnrollment: optInt(enr.prev_total),
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
            prevEnrollment: optInt(c.prev_total),
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

const PREV_REASONS: readonly PrevMonthReason[] = ['cross_school_year', 'unavailable']

export function prevMonthOf(row: Record<string, unknown>): PrevMonthInfo | null {
    const bd = row.breakdown
    if (!isObj(bd) || !isObj(bd.prev_month)) return null
    const p = bd.prev_month
    if (typeof p.year !== 'number' || typeof p.month !== 'number') return null
    return {
        year: p.year,
        month: p.month,
        comparable: p.comparable === true,
        reason: PREV_REASONS.includes(p.reason as PrevMonthReason) ? (p.reason as PrevMonthReason) : null,
    }
}

/** 本月在籍 − 上月在籍；上月不明（舊後端、新班、不跨學年、取不到）回 null。 */
export function headcountDelta(h: ClassHeadcount | null): number | null {
    if (!h || h.prevEnrollment === null) return null
    return h.enrollment - h.prevEnrollment
}

export function deltaText(delta: number | null): string {
    if (delta === null) return '—'
    if (delta === 0) return '持平'
    return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

/** 「較上月」儲存格的滑過說明。 */
export function deltaTitle(h: ClassHeadcount | null, prev: PrevMonthInfo | null): string {
    if (!h || !prev) return ''
    if (prev.reason === 'cross_school_year') return `本月是新學年第一個月，不與上一學年（${prev.month} 月）比較`
    if (!prev.comparable) return '上月人數取不到，暫時無法比較'
    if (h.prevEnrollment === null) return `上月（${prev.month} 月）還沒有這個班`
    return `${prev.month} 月 ${h.prevEnrollment} 人 → 本月 ${h.enrollment} 人`
}

/** 「較上月」欄表頭說明。 */
export function prevHeaderTip(prev: PrevMonthInfo | null): string {
    if (!prev) return '本月在籍 − 上月同一班在籍；不跨學年比較。'
    if (prev.reason === 'cross_school_year') return `本月是新學年第一個月，不與上一學年（${prev.month} 月）比較。`
    if (!prev.comparable) return '上月人數取不到，暫時無法比較。'
    return `本月在籍 − 上月（${prev.month} 月）同一班在籍；不帶班者比全園人數。不跨學年比較。`
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
