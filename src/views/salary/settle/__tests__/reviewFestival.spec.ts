import { describe, it, expect } from 'vitest'
import { parseFestivalPreview, accrualText, payoutText, accrualTip } from '../reviewFestival'

// GET /salaries/festival-bonus 的單列（後端 engine.calculate_festival_bonus_breakdown）
const row = (over: Record<string, unknown> = {}) => ({
    employeeId: 7,
    name: '王小明',
    category: '帶班老師',
    bonusBase: 4000,
    targetEnrollment: 27,
    currentEnrollment: 25,
    ratio: 0.9259,
    festivalBonus: 3704,
    overtimeBonus: 0,
    remark: '',
    ratioFloor: 0,
    ...over,
})

describe('parseFestivalPreview', () => {
    it('以 employeeId 建索引，金額取 festivalBonus', () => {
        const map = parseFestivalPreview([row(), row({ employeeId: 8, festivalBonus: 0, category: '其他', remark: '無帶班/無設定' })])
        expect(map.size).toBe(2)
        expect(map.get(7)).toMatchObject({ amount: 3704, category: '帶班老師', target: 27, enrollment: 25 })
        expect(map.get(8)).toMatchObject({ amount: 0, remark: '無帶班/無設定' })
    })

    it('後端計算失敗的錯誤列（沒有 employeeId）略過，不當成 0 元', () => {
        const map = parseFestivalPreview([{ name: 'Error: boom', festivalBonus: 0 }, row()])
        expect([...map.keys()]).toEqual([7])
    })

    it('金額不是數字的列略過；回應不是陣列回空表', () => {
        expect(parseFestivalPreview([row({ festivalBonus: 'x' })]).size).toBe(0)
        expect(parseFestivalPreview({ detail: 'nope' }).size).toBe(0)
        expect(parseFestivalPreview(null).size).toBe(0)
    })
})

describe('accrualText', () => {
    it('沒有資料顯示「—」、算出 0 元顯示「0」（兩者要分得出來）', () => {
        expect(accrualText(undefined)).toBe('—')
        const zero = parseFestivalPreview([row({ festivalBonus: 0 })]).get(7)
        expect(accrualText(zero)).toBe('0')
    })

    it('金額千分位、不帶 NT$', () => {
        expect(accrualText(parseFestivalPreview([row()]).get(7))).toBe('3,704')
    })
})

describe('payoutText', () => {
    it('同年只寫月份，跨年寫年份', () => {
        expect(payoutText([2026, 12], 2026)).toBe('12 月')
        expect(payoutText([2027, 2], 2026)).toBe('2027 年 2 月')
        expect(payoutText(null, 2026)).toBe('')
    })
})

describe('accrualTip', () => {
    it('列出類別、在籍／目標與達成率、基數、併入哪個月發', () => {
        const f = parseFestivalPreview([row()]).get(7)!
        const tip = accrualTip(f, [2026, 12], 2026)
        expect(tip).toContain('帶班老師')
        expect(tip).toContain('在籍／目標：25／27（達成率 92.6%）')
        expect(tip).toContain('基數：4,000')
        expect(tip).toContain('本月不發，預定併入 12 月薪資發放')
    })

    it('0 元時帶出備註（例如未滿 3 個月）', () => {
        const f = parseFestivalPreview([row({ festivalBonus: 0, remark: '未滿3個月' })]).get(7)!
        expect(accrualTip(f, [2026, 12], 2026)).toContain('備註：未滿3個月')
    })

    it('多班平均（達成率≠在籍／目標）：人數與達成率分兩行並加註，不寫成 16／20＝112%', () => {
        // staging 義華 10 月實例：帶兩班，後端給主班人數 16／20，達成率是兩班平均 112%
        const f = parseFestivalPreview([row({ targetEnrollment: 20, currentEnrollment: 16, ratio: 1.12, remark: '兩班平均' })]).get(7)!
        const tip = accrualTip(f, [2026, 11], 2026)
        expect(tip).toContain('在籍／目標：16／20\n')
        expect(tip).toContain('達成率：112.0%（非單班比例，見備註）')
        expect(tip).not.toContain('16／20（達成率')
    })

    it('沒有目標人數時只列在籍', () => {
        const f = parseFestivalPreview([row({ targetEnrollment: 0, currentEnrollment: 0, ratio: 0 })]).get(7)!
        expect(accrualTip(f, [2026, 12], 2026)).not.toContain('達成率')
    })
})
