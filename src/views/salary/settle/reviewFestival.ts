/**
 * 結薪覆核表「本月節慶（應計）」欄（純函式，StepReview 與測試共用）。
 *
 * 資料來源：GET /salaries/festival-bonus（後端 engine.calculate_festival_bonus_breakdown，
 * 單月、該月設定版本）。本月的應計金額＝屆時發放月逐月加總裡本月那一筆（同一計算），
 * 本月薪資單不入帳；會議缺席扣減與事病假等發放月規則於發放月才套用。
 * 後端回應沒有 response_model（OpenAPI 為 unknown），此處逐欄收斂型別。
 */
import { formatAmount } from '@/utils/currency'

export interface MonthFestival {
    employeeId: number
    category: string
    bonusBase: number
    target: number | null
    enrollment: number | null
    ratio: number
    amount: number
    remark: string
}

type YearMonth = readonly [number, number]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const finiteOr = <T>(v: unknown, fallback: T): number | T => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    return Number.isFinite(n) ? n : fallback
}

/** 後端錯誤列（`{"name": "Error: …", "festivalBonus": 0}`）沒有 employeeId → 略過，不當成 0 元。 */
export function parseFestivalPreview(data: unknown): Map<number, MonthFestival> {
    const out = new Map<number, MonthFestival>()
    if (!Array.isArray(data)) return out
    for (const item of data) {
        if (!isRecord(item)) continue
        const employeeId = finiteOr(item.employeeId, null)
        const amount = finiteOr(item.festivalBonus, null)
        if (employeeId === null || amount === null) continue
        out.set(employeeId, {
            employeeId,
            category: typeof item.category === 'string' ? item.category : '',
            bonusBase: finiteOr(item.bonusBase, 0),
            target: finiteOr(item.targetEnrollment, null),
            enrollment: finiteOr(item.currentEnrollment, null),
            ratio: finiteOr(item.ratio, 0),
            amount,
            remark: typeof item.remark === 'string' ? item.remark : '',
        })
    }
    return out
}

/** 沒資料「—」；算出 0 元顯示「0」——兩者意義不同（沒算到 vs 算了是 0）。 */
export function accrualText(f: MonthFestival | undefined): string {
    if (!f) return '—'
    return f.amount === 0 ? '0' : formatAmount(f.amount)
}

/** 發放薪資月文字：同年「12 月」、跨年「2027 年 2 月」。 */
export function payoutText(payout: YearMonth | null, year: number): string {
    if (!payout) return ''
    return payout[0] === year ? `${payout[1]} 月` : `${payout[0]} 年 ${payout[1]} 月`
}

/** 儲存格提示（多行）：為什麼是這個金額、什麼時候發。 */
export function accrualTip(f: MonthFestival, payout: YearMonth | null, year: number): string {
    const lines: string[] = []
    if (f.category) lines.push(`類別：${f.category}`)
    if (f.target !== null && f.target > 0) {
        const pct = `${(f.ratio * 100).toFixed(1)}%`
        // 多班平均／新班保障下限時，後端給的人數只是主班、達成率卻是另算 → 分兩行加註，
        // 免得看起來像「16／20＝112%」算錯
        const singleClass = f.enrollment !== null && Math.abs(f.enrollment / f.target - f.ratio) < 0.0005
        if (singleClass) {
            lines.push(`在籍／目標：${f.enrollment}／${f.target}（達成率 ${pct}）`)
        } else {
            lines.push(`在籍／目標：${f.enrollment ?? '—'}／${f.target}`)
            lines.push(`達成率：${pct}（非單班比例，見備註）`)
        }
    } else if (f.enrollment !== null && f.enrollment > 0) {
        lines.push(`在籍：${f.enrollment}`)
    }
    if (f.bonusBase > 0) lines.push(`基數：${formatAmount(f.bonusBase)}`)
    if (f.remark) lines.push(`備註：${f.remark}`)
    const when = payoutText(payout, year)
    lines.push(when ? `本月不發，預定併入 ${when}薪資發放` : '本月不發')
    return lines.join('\n')
}
