import { describe, it, expect } from 'vitest'
import {
    isValidMmDd,
    parseCheckDates,
    checkMonthsOf,
    pickDefaultMonth,
    validateKindConfig,
    validateConfig,
    emptyKindConfig,
    defaultSelectedIds,
    selectedPayouts,
    buildSettleBody,
    sumAmount,
    formatRate,
    skipGroupsOf,
    hasLegacyOther,
    roleLabel,
    type ReturningBonusPayout,
    type ReturningBonusSettleResult,
} from '../returningClassBonus'

const payout = (
    id: number,
    amount: number,
    alreadyPaid = false,
    roles = ['head'],
    legacyOther = 0,
): ReturningBonusPayout => ({
    employee_id: id,
    employee_name: `員工${id}`,
    amount,
    roles,
    classrooms: ['大班A'],
    already_paid: alreadyPaid,
    legacy_other_amount: legacyOther,
})

describe('核算日解析與檢核', () => {
    it('isValidMmDd：合法月日才通過', () => {
        expect(isValidMmDd('03-15')).toBe(true)
        expect(isValidMmDd('02-29')).toBe(true)
        expect(isValidMmDd('02-30')).toBe(false)
        expect(isValidMmDd('13-01')).toBe(false)
        expect(isValidMmDd('3-15')).toBe(false)
        expect(isValidMmDd('')).toBe(false)
    })

    it('parseCheckDates：多種分隔符與 3/15 寫法補零', () => {
        expect(parseCheckDates('03-15, 9/15、12-1')).toEqual(['03-15', '09-15', '12-01'])
        expect(parseCheckDates('  ')).toEqual([])
        expect(parseCheckDates('abc')).toEqual(['abc'])
    })

    it('checkMonthsOf：升冪去重、略過不合法日期', () => {
        expect(checkMonthsOf({ check_dates: ['09-15', '03-15', 'xx'] })).toEqual([3, 9])
        expect(checkMonthsOf(null)).toEqual([])
    })

    it('pickDefaultMonth：取已到的最後一個核算月，都沒到取第一個', () => {
        expect(pickDefaultMonth([3, 9], 10)).toBe(9)
        expect(pickDefaultMonth([3, 9], 5)).toBe(3)
        expect(pickDefaultMonth([6, 12], 2)).toBe(6)
        expect(pickDefaultMonth([], 5)).toBeNull()
    })

    it('validateKindConfig：同月重複、格式錯、金額越界、啟用無核算日都報錯', () => {
        const ok = { enabled: true, check_dates: ['03-15', '09-15'], head_amount: 1000, assistant_amount: 500 }
        expect(validateKindConfig(ok, 'X')).toEqual([])
        expect(validateKindConfig({ ...ok, check_dates: ['03-15', '03-20'] }, 'X')).toHaveLength(1)
        expect(validateKindConfig({ ...ok, check_dates: ['3-15'] }, 'X')).toHaveLength(1)
        expect(validateKindConfig({ ...ok, head_amount: -1 }, 'X')).toHaveLength(1)
        expect(validateKindConfig({ ...ok, assistant_amount: 100001 }, 'X')).toHaveLength(1)
        expect(validateKindConfig({ ...ok, head_amount: 1.5 }, 'X')).toHaveLength(1)
        expect(validateKindConfig({ ...ok, check_dates: [] }, 'X')).toHaveLength(1)
    })

    it('預設空白設定（兩類關閉、金額 0）可通過檢核——不寫死任何租戶金額', () => {
        const cfg = { registration: emptyKindConfig(), prepay: emptyKindConfig() }
        expect(validateConfig(cfg)).toEqual([])
        expect(cfg.registration).toEqual({ enabled: false, check_dates: [], head_amount: 0, assistant_amount: 0 })
    })
})

describe('勾選與結算 body', () => {
    const payouts = [payout(1, 2667), payout(2, 333, false, ['assistant']), payout(3, 667, true)]

    it('預設勾選所有未發放者（含副班導），已發放者不勾', () => {
        expect(defaultSelectedIds(payouts)).toEqual([1, 2])
    })

    it('同歸屬月已有「其他」手登者預設不勾，HR 手動勾選後仍可送出', () => {
        const withLegacy = [...payouts, payout(4, 2667, false, ['head'], 2667)]
        expect(hasLegacyOther(withLegacy[3])).toBe(true)
        expect(defaultSelectedIds(withLegacy)).toEqual([1, 2])
        expect(buildSettleBody('registration', 2026, 9, withLegacy, [1, 4]).employee_ids).toEqual([1, 4])
    })

    it('selectedPayouts 排除已發放者，即使 id 殘留在勾選清單', () => {
        expect(selectedPayouts(payouts, [1, 3]).map((p) => p.employee_id)).toEqual([1])
    })

    it('buildSettleBody 一律顯式帶 employee_ids（取消副班導後只送班導）', () => {
        expect(buildSettleBody('registration', 2026, 3, payouts, [1])).toEqual({
            kind: 'registration',
            year: 2026,
            month: 3,
            employee_ids: [1],
        })
        expect(buildSettleBody('prepay', 2026, 6, payouts, []).employee_ids).toEqual([])
    })

    it('sumAmount 合計', () => {
        expect(sumAmount(selectedPayouts(payouts, [1, 2]))).toBe(3000)
    })
})

describe('顯示 helper', () => {
    it('formatRate：null 顯示 —，其餘一位小數百分比', () => {
        expect(formatRate(null)).toBe('—')
        expect(formatRate(undefined)).toBe('—')
        expect(formatRate(1)).toBe('100%')
        expect(formatRate(0.9567)).toBe('95.7%')
    })

    it('roleLabel：head／assistant 轉中文，未知原樣', () => {
        expect(roleLabel('head')).toBe('班導')
        expect(roleLabel('assistant')).toBe('副班導')
        expect(roleLabel('other')).toBe('other')
    })

    it('skipGroupsOf：只列有人的跳過類別，缺姓名以員工編號代替', () => {
        const result: ReturningBonusSettleResult = {
            kind: 'registration',
            category: 'returning_registration',
            check_date: '2026-03-15',
            period_year: 2026,
            period_month: 3,
            created: [{ employee_id: 1, employee_name: '甲', amount: 2667 }],
            skipped_already_paid: [],
            skipped_self: [{ employee_id: 2, employee_name: '乙' }],
            skipped_finalized: [{ employee_id: 3, employee_name: null }],
            skipped_unselected: [],
            skipped_legacy_other: [{ employee_id: 4, employee_name: '丁' }],
            total_amount: 2667,
            warnings: [],
        }
        const groups = skipGroupsOf(result)
        expect(groups.map((g) => g.key)).toEqual(['skipped_self', 'skipped_finalized', 'skipped_legacy_other'])
        expect(groups[1].names).toEqual(['員工 #3'])
    })
})
