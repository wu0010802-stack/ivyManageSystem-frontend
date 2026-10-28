import { describe, it, expect } from 'vitest'
import { reasonLabel, collectionCoverageMessage } from '../festivalHeadcountLabels'

describe('reasonLabel', () => {
    it('註冊口徑新原因', () => {
        expect(reasonLabel('unpaid_fee')).toBe('未繳月費')
        expect(reasonLabel('no_fee_record')).toBe('無月費單')
    })
    it('長假帶天數門檻：請假滿 N 天即算（業主 2026-10-28，原為逾 N 天）；沒給門檻預設 10', () => {
        expect(reasonLabel('long_leave', 12)).toBe('請假滿 12 天')
        expect(reasonLabel('long_leave')).toBe('請假滿 10 天')
        expect(reasonLabel('long_leave', null)).toBe('請假滿 10 天')
    })
    it('其他既有原因文案不變', () => {
        expect(reasonLabel('on_leave')).toBe('休學')
    })
    it('未知代碼原樣顯示', () => {
        expect(reasonLabel('zzz')).toBe('zzz')
    })
})

describe('collectionCoverageMessage', () => {
    it('未齊時含涵蓋提示與未配對筆數', () => {
        const msg = collectionCoverageMessage({
            complete: false,
            latest_paid_date: '2026-09-25',
            unmatched_count: 3,
        })
        expect(msg).toContain('代收明細尚未涵蓋到月底')
        expect(msg).toContain('2026-09-25')
        expect(msg).toContain('3 筆未配對')
    })
    it('無任何代收日期與未配對時仍提示', () => {
        const msg = collectionCoverageMessage({ complete: false, latest_paid_date: null, unmatched_count: 0 })
        expect(msg).toContain('代收明細尚未涵蓋到月底')
        expect(msg).not.toContain('未配對')
    })
    it('齊全時回 null', () => {
        expect(
            collectionCoverageMessage({ complete: true, latest_paid_date: '2026-09-30', unmatched_count: 0 }),
        ).toBeNull()
    })
})
