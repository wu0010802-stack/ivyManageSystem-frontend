import { describe, it, expect } from 'vitest'
import {
    validateInsuranceVsBase,
    validateBaseSalary,
    validateHourlyRate,
    validatePensionSelfRate,
    pensionRateToPercent,
    pensionPercentToRate,
} from '@/validators/employeeForm'
import { MINIMUM_MONTHLY_WAGE, MINIMUM_HOURLY_WAGE } from '@/constants/laborCompliance'

describe('validateInsuranceVsBase', () => {
    it('投保 < 月薪 → 錯誤', () => {
        const r = validateInsuranceVsBase(28000, 30000, 'regular')
        expect(r).toMatch(/投保級距需大於或等於基本薪資/)
    })
    it('投保 = 月薪 → OK', () => {
        expect(validateInsuranceVsBase(30000, 30000, 'regular')).toBeNull()
    })
    it('時薪制不檢查（投保 vs 月薪）', () => {
        expect(validateInsuranceVsBase(0, 0, 'hourly')).toBeNull()
    })
    it('投保為 0 → 不檢查（後端 fallback）', () => {
        expect(validateInsuranceVsBase(0, 30000, 'regular')).toBeNull()
    })
})

describe('validateBaseSalary', () => {
    it(`月薪 < ${MINIMUM_MONTHLY_WAGE} → 錯誤`, () => {
        const r = validateBaseSalary(20000, 'regular')
        expect(r).toContain('基本工資')
    })
    it('月薪等於下限 → OK', () => {
        expect(validateBaseSalary(MINIMUM_MONTHLY_WAGE, 'regular')).toBeNull()
    })
    it('時薪制不檢查月薪', () => {
        expect(validateBaseSalary(0, 'hourly')).toBeNull()
    })
})

describe('validateHourlyRate', () => {
    it(`時薪 < ${MINIMUM_HOURLY_WAGE} → 錯誤`, () => {
        const r = validateHourlyRate(150, 'hourly')
        expect(r).toContain('基本時薪')
    })
    it('時薪等於下限 → OK', () => {
        expect(validateHourlyRate(MINIMUM_HOURLY_WAGE, 'hourly')).toBeNull()
    })
    it('月薪制不檢查時薪', () => {
        expect(validateHourlyRate(0, 'regular')).toBeNull()
    })
})

describe('validatePensionSelfRate', () => {
    it('0 → OK', () => expect(validatePensionSelfRate(0)).toBeNull())
    it('0.06 → OK', () => expect(validatePensionSelfRate(0.06)).toBeNull())
    it('0.07 → 錯誤', () => expect(validatePensionSelfRate(0.07)).toMatch(/0% ~ 6%/))
    it('-0.01 → 錯誤', () => expect(validatePensionSelfRate(-0.01)).toMatch(/0% ~ 6%/))
})

describe('pension 百分比雙向轉換', () => {
    it('rate → percent', () => {
        expect(pensionRateToPercent(0.06)).toBe(6)
        expect(pensionRateToPercent(0.0625)).toBe(6.25)
        expect(pensionRateToPercent(null)).toBe(0)
    })
    it('percent → rate', () => {
        expect(pensionPercentToRate(6)).toBe(0.06)
        expect(pensionPercentToRate(6.25)).toBe(0.0625)
        expect(pensionPercentToRate(0)).toBe(0)
    })
    it('來回轉換不變', () => {
        const samples = [0, 0.01, 0.025, 0.045, 0.06]
        for (const r of samples) {
            expect(pensionPercentToRate(pensionRateToPercent(r))).toBe(r)
        }
    })
})
