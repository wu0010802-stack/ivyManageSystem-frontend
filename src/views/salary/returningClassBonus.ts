// 舊生註冊／預繳獎金頁的純邏輯（無 Vue 依賴，供 vitest 直接測）。
// 金額一律由使用者在 UI 輸入；這裡**不得**放任何租戶（含義華）的預設金額。

import type { Schema } from '@/api/_generated/typed'

export type ReturningBonusKind = 'registration' | 'prepay'
export type ReturningBonusKindConfig = Schema<'ReturningBonusKindConfig'>
export type ReturningBonusConfig = Schema<'ReturningBonusConfig'>
export type ReturningBonusPayout = Schema<'ReturningBonusPayoutOut'>
export type ReturningBonusSettleResult = Schema<'ReturningBonusSettleOut'>
export type ReturningBonusSettleEmployee = Schema<'ReturningBonusSettleEmployeeOut'>

/** 與後端 PUT /returning-class-bonus/config 的金額上限一致（超過回 422）。 */
export const MAX_RETURNING_BONUS_AMOUNT = 100000

export const KIND_LABELS: Record<ReturningBonusKind, string> = {
    registration: '舊生註冊率獎金',
    prepay: '舊生預繳獎金',
}

export const ROLE_LABELS: Record<string, string> = {
    head: '班導',
    assistant: '副班導',
}

export function roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role
}

/** 未設定時的空白設定：兩類皆關閉、金額 0（＝後端預設）。 */
export function emptyKindConfig(): ReturningBonusKindConfig {
    return { enabled: false, check_dates: [], head_amount: 0, assistant_amount: 0 }
}

const MMDD_RE = /^(\d{2})-(\d{2})$/
// 以閏年天數判斷 MM-DD 是否存在（02-29 允許，與後端日期檢核一致時以後端 422 為準）。
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** 'MM-DD' 是否為合法月日。 */
export function isValidMmDd(value: string): boolean {
    const m = MMDD_RE.exec(value)
    if (!m) return false
    const month = Number(m[1])
    const day = Number(m[2])
    if (month < 1 || month > 12) return false
    return day >= 1 && day <= DAYS_IN_MONTH[month - 1]
}

/**
 * 把使用者輸入的核算日文字（逗號、頓號或空白分隔）拆成 'MM-DD' 陣列。
 * 允許 '3-15'、'3/15' 這類寫法並補零；無法辨識的片段原樣保留，交給 validateKindConfig 報錯。
 */
export function parseCheckDates(text: string): string[] {
    return text
        .split(/[\s,，、;；]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => {
            const m = /^(\d{1,2})[-/](\d{1,2})$/.exec(s)
            if (!m) return s
            return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
        })
}

export function formatCheckDates(dates: readonly string[]): string {
    return dates.join(', ')
}

/** 核算月（升冪、去重）；不合法日期略過。 */
export function checkMonthsOf(cfg: Pick<ReturningBonusKindConfig, 'check_dates'> | null | undefined): number[] {
    if (!cfg) return []
    const months = new Set<number>()
    for (const d of cfg.check_dates) {
        if (isValidMmDd(d)) months.add(Number(d.slice(0, 2)))
    }
    return [...months].sort((a, b) => a - b)
}

/** 預設選取的核算月：今年已到（≤ 當月）的最後一個，都還沒到就取第一個；無核算月回 null。 */
export function pickDefaultMonth(months: readonly number[], currentMonth: number): number | null {
    if (months.length === 0) return null
    const reached = months.filter((m) => m <= currentMonth)
    return reached.length > 0 ? reached[reached.length - 1] : months[0]
}

/** 前端先行檢核（與後端 422 條件對齊）；回傳錯誤訊息陣列，空陣列＝通過。 */
export function validateKindConfig(cfg: ReturningBonusKindConfig, label: string): string[] {
    const errors: string[] = []
    const seenMonths = new Set<number>()
    for (const d of cfg.check_dates) {
        if (!isValidMmDd(d)) {
            errors.push(`${label}：核算日「${d}」格式不正確，請用 MM-DD（例：03-15）`)
            continue
        }
        const month = Number(d.slice(0, 2))
        if (seenMonths.has(month)) {
            errors.push(`${label}：同一個月份只能有一個核算日（${month} 月重複）`)
        }
        seenMonths.add(month)
    }
    for (const [field, name] of [
        ['head_amount', '班導金額'],
        ['assistant_amount', '副班導金額'],
    ] as const) {
        const v = cfg[field]
        if (!Number.isInteger(v) || v < 0 || v > MAX_RETURNING_BONUS_AMOUNT) {
            errors.push(`${label}：${name}須為 0 到 ${MAX_RETURNING_BONUS_AMOUNT} 的整數`)
        }
    }
    if (cfg.enabled && cfg.check_dates.length === 0) {
        errors.push(`${label}：啟用時至少需設定一個核算日`)
    }
    return errors
}

export function validateConfig(cfg: ReturningBonusConfig): string[] {
    return [
        ...validateKindConfig(cfg.registration, KIND_LABELS.registration),
        ...validateKindConfig(cfg.prepay, KIND_LABELS.prepay),
    ]
}

/** 預設勾選：所有尚未發放者（副班導也預設勾選，HR 可自行取消）。 */
export function defaultSelectedIds(payouts: readonly ReturningBonusPayout[]): number[] {
    return payouts.filter((p) => !p.already_paid).map((p) => p.employee_id)
}

/** 勾選中、且仍可發放的領取人（排除已發放者，避免 stale 勾選殘留）。 */
export function selectedPayouts(
    payouts: readonly ReturningBonusPayout[],
    selectedIds: readonly number[],
): ReturningBonusPayout[] {
    const set = new Set(selectedIds)
    return payouts.filter((p) => !p.already_paid && set.has(p.employee_id))
}

export function sumAmount(rows: readonly { amount: number }[]): number {
    return rows.reduce((sum, r) => sum + r.amount, 0)
}

/** 結算 body：一律顯式帶 employee_ids，未勾選者由後端歸入 skipped_unselected。 */
export function buildSettleBody(
    kind: ReturningBonusKind,
    year: number,
    month: number,
    payouts: readonly ReturningBonusPayout[],
    selectedIds: readonly number[],
): Schema<'ReturningBonusSettleIn'> {
    return {
        kind,
        year,
        month,
        employee_ids: selectedPayouts(payouts, selectedIds).map((p) => p.employee_id),
    }
}

/** 比率顯示：null（母體為 0 或無資料）→「—」，其餘取到小數一位百分比。 */
export function formatRate(rate: number | null | undefined): string {
    if (rate == null) return '—'
    return `${Math.round(rate * 1000) / 10}%`
}

export interface SkipGroup {
    key: 'skipped_already_paid' | 'skipped_self' | 'skipped_finalized' | 'skipped_unselected'
    label: string
    hint: string
    names: string[]
}

const SKIP_GROUP_DEFS: Omit<SkipGroup, 'names'>[] = [
    { key: 'skipped_already_paid', label: '已發放過', hint: '同類別同月已有表外獎金紀錄（含 HR 手動登錄），未重複發放' },
    { key: 'skipped_self', label: '結算者本人', hint: '職權分離：請由其他有權限的人員再次結算即可補發' },
    { key: 'skipped_finalized', label: '薪資已封存', hint: '歸屬月至年底有已封存月份，未寫入；需先解除封存' },
    { key: 'skipped_unselected', label: '未勾選', hint: '本次未勾選，之後可再勾選結算' },
]

function displayName(e: ReturningBonusSettleEmployee): string {
    return e.employee_name || `員工 #${e.employee_id}`
}

/** 結算結果的四類跳過名單；只回傳有人的類別。 */
export function skipGroupsOf(result: ReturningBonusSettleResult): SkipGroup[] {
    return SKIP_GROUP_DEFS.map((def) => ({
        ...def,
        names: (result[def.key] ?? []).map(displayName),
    })).filter((g) => g.names.length > 0)
}
