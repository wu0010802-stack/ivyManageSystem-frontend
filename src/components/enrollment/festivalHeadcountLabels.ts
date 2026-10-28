import type { Schema } from '@/api/_generated/typed'

export type CollectionCoverage = Schema<'CollectionCoverageOut'>

/** 排除明細的原因文案；`long_leave` 帶天數門檻。 */
export const reasonLabel = (code: string, leaveDays?: number | null): string => {
    switch (code) {
        case 'long_leave':
            return `請假滿 ${leaveDays ?? 10} 天`
        case 'on_leave':
            return '休學'
        case 'unpaid_fee':
            return '未繳月費'
        case 'no_fee_record':
            return '無月費單'
        default:
            return code
    }
}

/** 代收明細未齊提示；齊全回 null。 */
export const collectionCoverageMessage = (c: CollectionCoverage): string | null => {
    if (c.complete) return null
    const parts = ['代收明細尚未涵蓋到月底']
    if (c.latest_paid_date) parts.push(`（最新收款日 ${c.latest_paid_date}）`)
    if (c.unmatched_count > 0) parts.push(`，另有 ${c.unmatched_count} 筆未配對`)
    return parts.join('')
}
