/**
 * 結薪覆核表的金額欄定義（純資料＋純函式，StepReview 與測試共用）。
 *
 * 分組依後端口徑：
 * - 加項＝進「應發」的欄（後端 services/salary/totals.py GROSS_SALARY_COMPONENT_FIELDS；
 *   時薪工資讀 records 的 hourly_total，舊後端沒帶時才以「應發 − 其餘加項」反推）
 * - 扣項＝進「總扣款」的欄（DEDUCTION_COMPONENT_FIELDS；補充保費已併入健保，不另列）
 * - 另計＝不進應發：未休折現（併入主薪轉）、節慶／超額獎金（獨立轉帳）、
 *   節慶獎金扣減（只從節慶獎金扣，不進總扣款）
 *
 * 本月整欄皆為 0 的欄預設收合（合計欄永遠顯示），避免 25 欄裡一半是 0。
 */

export type ColGroup = 'add' | 'ded' | 'separate'

export interface MoneyCol {
    key: string
    label: string
    group: ColGroup
    /** 合計欄：永遠顯示、粗體 */
    total?: boolean
    /** GET /salaries/{id}/field-breakdown 支援此欄（可點開逐筆明細） */
    breakdown?: boolean
    tooltip?: string
}

/** 進應發的加項欄（不含反推的時薪工資） */
const GROSS_COMPONENT_KEYS = [
    'base_salary',
    'performance_bonus',
    'special_bonus',
    'supervisor_dividend',
    'meeting_overtime_pay',
    'birthday_bonus',
    'overtime_pay',
    'extra_allowance',
] as const

export const HOURLY_PAY_KEY = '__hourly_pay'

export const MONEY_COLUMNS: readonly MoneyCol[] = Object.freeze([
    { key: 'base_salary', label: '底薪', group: 'add', breakdown: true },
    { key: HOURLY_PAY_KEY, label: '時薪工資', group: 'add', tooltip: '時薪制員工的工資' },
    { key: 'overtime_pay', label: '加班津貼', group: 'add', breakdown: true },
    { key: 'meeting_overtime_pay', label: '園務會議', group: 'add', breakdown: true },
    { key: 'supervisor_dividend', label: '主管紅利', group: 'add', breakdown: true },
    { key: 'birthday_bonus', label: '生日禮金', group: 'add', breakdown: true },
    { key: 'extra_allowance', label: '額外加給', group: 'add' },
    { key: 'performance_bonus', label: '績效獎金', group: 'add' },
    { key: 'special_bonus', label: '特別獎金', group: 'add' },
    { key: 'gross_salary', label: '應發', group: 'add', total: true },

    { key: 'labor_insurance', label: '勞保', group: 'ded', breakdown: true },
    { key: 'health_insurance', label: '健保', group: 'ded', breakdown: true, tooltip: '含二代健保補充保費' },
    { key: 'pension_self', label: '勞退自提', group: 'ded' },
    { key: 'leave_deduction', label: '請假', group: 'ded', breakdown: true },
    { key: 'late_deduction', label: '遲到', group: 'ded', breakdown: true },
    { key: 'early_leave_deduction', label: '早退', group: 'ded', breakdown: true },
    { key: 'missing_punch_deduction', label: '漏打卡', group: 'ded' },
    { key: 'absence_deduction', label: '曠職', group: 'ded', breakdown: true },
    { key: 'insurance_adjustment', label: '保費追溯', group: 'ded', tooltip: '正數＝補收、負數＝退回' },
    { key: 'other_deduction', label: '其他', group: 'ded' },
    { key: 'total_deductions', label: '總扣款', group: 'ded', total: true },

    { key: 'unused_leave_payout', label: '未休折現', group: 'separate', tooltip: '補休到期、特休週年、離職結算的未休假折現，併入實領' },
    { key: 'festival_bonus', label: '節慶獎金', group: 'separate', breakdown: true, tooltip: '依各園設定的發放月入帳；獨立轉帳，不進應發' },
    { key: 'meeting_absence_deduction', label: '節慶獎金扣減', group: 'separate', breakdown: true, tooltip: '僅從節慶獎金扣減，不計入總扣款與實領' },
    { key: 'overtime_bonus', label: '超額獎金', group: 'separate', breakdown: true, tooltip: '月薪不發（超額改在年終結算）；只有手動調整才會出現金額' },
] as MoneyCol[])

/**
 * manual_overrides 存的是 SalaryRecord 欄名，三個保費欄與 records 回應的欄名不同
 * （後端 api/salary/manual_adjust.py）：用這張表把覆寫欄對回畫面欄。
 */
export const OVERRIDE_FIELD_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    labor_insurance: 'labor_insurance_employee',
    health_insurance: 'health_insurance_employee',
    pension_self: 'pension_employee',
})

/** 覆寫欄名 → 中文（含保費欄的 SalaryRecord 欄名）。 */
export const OVERRIDE_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
    ...Object.fromEntries(MONEY_COLUMNS.map((c) => [c.key, c.label])),
    labor_insurance_employee: '勞保',
    health_insurance_employee: '健保',
    pension_employee: '勞退自提',
    net_salary: '實領',
    gross_salary: '應發',
})

export function isOverridden(row: Record<string, unknown>, columnKey: string): boolean {
    const overrides = row.manual_overrides
    if (!Array.isArray(overrides)) return false
    const alias = OVERRIDE_FIELD_ALIASES[columnKey]
    return overrides.includes(columnKey) || (alias !== undefined && overrides.includes(alias))
}

export const GROUP_LABEL: Record<ColGroup, string> = {
    add: '加項（元）',
    ded: '扣項（元）',
    separate: '另計（不進應發）',
}

const num = (v: unknown): number => {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
}

/** 時薪制工資：優先讀後端 hourly_total；舊後端沒帶時以「應發 − 其他加項」反推（差 < 1 視為 0）。 */
export function hourlyPayOf(row: Record<string, unknown>): number {
    if (typeof row.hourly_total === 'number' && Number.isFinite(row.hourly_total)) return row.hourly_total
    const rest = GROSS_COMPONENT_KEYS.reduce((s, k) => s + num(row[k]), 0)
    const diff = Math.round(num(row.gross_salary) - rest)
    return diff >= 1 ? diff : 0
}

export function cellValue(row: Record<string, unknown>, col: MoneyCol): number {
    return col.key === HOURLY_PAY_KEY ? hourlyPayOf(row) : num(row[col.key])
}

export interface ColumnSplit {
    visible: Record<ColGroup, MoneyCol[]>
    hidden: MoneyCol[]
}

/** 合計欄永遠顯示；其餘欄本月只要有人非 0 就顯示，否則收合（showAll 時全顯示）。 */
export function splitColumns(records: Record<string, unknown>[], showAll: boolean): ColumnSplit {
    const visible: Record<ColGroup, MoneyCol[]> = { add: [], ded: [], separate: [] }
    const hidden: MoneyCol[] = []
    for (const col of MONEY_COLUMNS) {
        const used = col.total || records.some((r) => cellValue(r, col) !== 0)
        if (used || showAll) visible[col.group].push(col)
        else hidden.push(col)
    }
    return { visible, hidden }
}

/** 本月有獨立轉帳獎金（節慶／超額）才需要「含獎金實領」欄。 */
export function hasSeparateBonus(records: Record<string, unknown>[]): boolean {
    return records.some((r) => num(r.festival_bonus) !== 0 || num(r.overtime_bonus) !== 0)
}
