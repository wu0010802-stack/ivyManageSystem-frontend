import {
    MINIMUM_MONTHLY_WAGE,
    MINIMUM_HOURLY_WAGE,
    PENSION_SELF_RATE_MAX,
} from '@/constants/laborCompliance'

const fmtNTD = (n) => `NT$${Number(n).toLocaleString()}`

export function validateInsuranceVsBase(insurance, base, employeeType) {
    if (employeeType !== 'regular') return null
    const ins = Number(insurance) || 0
    const b = Number(base) || 0
    if (ins <= 0 || b <= 0) return null
    if (ins < b) {
        return `投保級距需大於或等於基本薪資 ${fmtNTD(b)}（目前 ${fmtNTD(ins)}）`
    }
    return null
}

export function validateBaseSalary(baseSalary, employeeType) {
    if (employeeType !== 'regular') return null
    const b = Number(baseSalary) || 0
    if (b > 0 && b < MINIMUM_MONTHLY_WAGE) {
        return `正職底薪不可低於基本工資 ${fmtNTD(MINIMUM_MONTHLY_WAGE)}`
    }
    return null
}

export function validateHourlyRate(hourlyRate, employeeType) {
    if (employeeType !== 'hourly') return null
    const r = Number(hourlyRate) || 0
    if (r > 0 && r < MINIMUM_HOURLY_WAGE) {
        return `時薪不可低於基本時薪 ${fmtNTD(MINIMUM_HOURLY_WAGE)}`
    }
    return null
}

export function validatePensionSelfRate(rate) {
    const r = Number(rate)
    if (Number.isNaN(r)) return '勞退自提範圍為 0% ~ 6%'
    if (r < 0 || r > PENSION_SELF_RATE_MAX) {
        return '勞退自提範圍為 0% ~ 6%'
    }
    return null
}

export function pensionRateToPercent(rate) {
    const r = Number(rate)
    if (!r || Number.isNaN(r)) return 0
    return Math.round(r * 10000) / 100
}

export function pensionPercentToRate(percent) {
    const p = Number(percent)
    if (!p || Number.isNaN(p)) return 0
    return Math.round(p * 10000) / 1000000
}
