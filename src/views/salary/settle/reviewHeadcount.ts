/**
 * 結薪覆核：班級人數差距（在籍 vs 節慶目標人數）的純函式。
 *
 * 資料來源是 GET /salaries/records 每筆的 `breakdown`（後端
 * services/salary/breakdown_enrollment.py）：
 * - `breakdown.enrollment`：本人當班導的班（target／overtime_target 為該班節慶目標人數與超額門檻）
 * - `breakdown.assistant.classes`：副班導／美師所帶各班（共用副班導已改用 shared_assistant 目標）
 *
 * ⚠ 這是「班級」的人數差距：目標一律是該班依有無副班導查的班級目標（同班的人看到同一組數字），
 * 不是個人節慶獎金的計算基準——引擎對共用副班導與美師改用共用目標、主管看全園人數、
 * 發放月按期間逐月累計、新班有保障比例。個人金額以「節慶獎金」欄位明細為準。
 */

export type HeadcountRole = 'head_teacher' | 'assistant_teacher' | 'art_teacher'

export interface ClassHeadcount {
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

export function headcountsOf(row: Record<string, unknown>): ClassHeadcount[] {
    const bd = row.breakdown
    if (!isObj(bd)) return []
    const out: ClassHeadcount[] = []
    const enr = bd.enrollment
    if (isObj(enr) && typeof enr.classroom_name === 'string') {
        out.push({
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

export const ROLE_LABEL: Record<HeadcountRole, string> = {
    head_teacher: '班導',
    assistant_teacher: '副班導',
    art_teacher: '美師',
}
