import { describe, it, expect } from 'vitest'
import {
    MONEY_COLUMNS,
    HOURLY_PAY_KEY,
    hourlyPayOf,
    cellValue,
    splitColumns,
    hasSeparateBonus,
    isOverridden,
    OVERRIDE_FIELD_LABELS,
} from '../reviewColumns'

const row = (over: Record<string, unknown> = {}) => ({
    base_salary: 30000,
    gross_salary: 30500,
    meeting_overtime_pay: 500,
    labor_insurance: 738,
    health_insurance: 458,
    total_deductions: 1196,
    ...over,
})

describe('欄位分組（與後端應發／總扣款口徑一致）', () => {
    it('節慶／超額獎金與未休折現不在加項（不進應發）', () => {
        const add = MONEY_COLUMNS.filter((c) => c.group === 'add').map((c) => c.key)
        expect(add).not.toContain('festival_bonus')
        expect(add).not.toContain('overtime_bonus')
        expect(add).not.toContain('unused_leave_payout')
        expect(add).toContain('extra_allowance') // 以前表上漏掉、會在實領裡看到卻找不到來源
    })

    it('節慶獎金扣減不在扣項（不進總扣款）；補充保費不另列（已併入健保）', () => {
        const ded = MONEY_COLUMNS.filter((c) => c.group === 'ded').map((c) => c.key)
        expect(ded).not.toContain('meeting_absence_deduction')
        expect(ded).not.toContain('supplementary_health_employee')
        expect(ded).toContain('insurance_adjustment')
        expect(ded).toContain('missing_punch_deduction')
    })
})

describe('hourlyPayOf', () => {
    it('月薪制：應發＝各加項之和 → 0', () => {
        expect(hourlyPayOf(row())).toBe(0)
    })
    it('時薪制：應發 − 其他加項', () => {
        expect(hourlyPayOf(row({ base_salary: 0, gross_salary: 6740, meeting_overtime_pay: 500 }))).toBe(6240)
    })
    it('後端有帶 hourly_total 就直接用，不反推', () => {
        expect(hourlyPayOf(row({ base_salary: 1000.5, gross_salary: 1001, hourly_total: 0 }))).toBe(0)
        expect(hourlyPayOf(row({ base_salary: 0, gross_salary: 6740, hourly_total: 6240 }))).toBe(6240)
    })
    it('四捨五入誤差 < 1 視為 0', () => {
        expect(hourlyPayOf(row({ gross_salary: 30500.4 }))).toBe(0)
    })
    it('cellValue 對反推欄走 hourlyPayOf', () => {
        const col = MONEY_COLUMNS.find((c) => c.key === HOURLY_PAY_KEY)!
        expect(cellValue(row({ base_salary: 0, gross_salary: 1000, meeting_overtime_pay: 0 }), col)).toBe(1000)
    })
})

describe('splitColumns', () => {
    it('整欄為 0 的收合；合計欄永遠顯示', () => {
        const { visible, hidden } = splitColumns([row(), row({ base_salary: 29000, gross_salary: 29500 })], false)
        expect(visible.add.map((c) => c.key)).toEqual(['base_salary', 'meeting_overtime_pay', 'gross_salary'])
        expect(visible.ded.map((c) => c.key)).toEqual(['labor_insurance', 'health_insurance', 'total_deductions'])
        expect(visible.separate).toEqual([])
        expect(hidden.map((c) => c.key)).toContain('festival_bonus')
        expect(hidden.map((c) => c.key)).toContain(HOURLY_PAY_KEY)
    })

    it('任一人非 0 就顯示該欄', () => {
        const { visible } = splitColumns([row(), row({ absence_deduction: 983 })], false)
        expect(visible.ded.map((c) => c.key)).toContain('absence_deduction')
    })

    it('showAll → 全部顯示、hidden 為空', () => {
        const { visible, hidden } = splitColumns([row()], true)
        expect(hidden).toEqual([])
        expect(visible.add.length + visible.ded.length + visible.separate.length).toBe(MONEY_COLUMNS.length)
    })
})

describe('hasSeparateBonus', () => {
    it('節慶或超額獎金任一非 0 才為 true', () => {
        expect(hasSeparateBonus([row()])).toBe(false)
        expect(hasSeparateBonus([row(), row({ overtime_bonus: 1200 })])).toBe(true)
    })
})

describe('人工調整欄名對照', () => {
    it('保費欄的覆寫存 SalaryRecord 欄名，也要對得上畫面欄', () => {
        const r = { manual_overrides: ['labor_insurance_employee', 'festival_bonus'] }
        expect(isOverridden(r, 'labor_insurance')).toBe(true)
        expect(isOverridden(r, 'health_insurance')).toBe(false)
        expect(isOverridden(r, 'festival_bonus')).toBe(true)
        expect(OVERRIDE_FIELD_LABELS.labor_insurance_employee).toBe('勞保')
    })
})
