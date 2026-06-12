import { describe, it, expect, beforeEach } from 'vitest'
import {
    deriveStatus,
    detectAnomalies,
    sortByAttention,
    getThresholds,
    setThresholds,
    DEFAULT_THRESHOLDS,
    type SettlementRecord,
} from '@/composables/useSalarySettlement'

const rec = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    employee_id: 'E1',
    employee_name: '測試',
    version: 1,
    gross_salary: 40000,
    net_salary: 36000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    ...over,
})

describe('deriveStatus', () => {
    it('無紀錄 → not_calculated', () => {
        expect(deriveStatus([])).toBe('not_calculated')
    })
    it('任一未封存紀錄 breakdown_stale → needs_recalc（優先於覆核中）', () => {
        expect(deriveStatus([rec(), rec({ breakdown_stale: true })])).toBe('needs_recalc')
    })
    it('未全封存 → reviewing', () => {
        expect(deriveStatus([rec({ is_finalized: true }), rec()])).toBe('reviewing')
    })
    it('全封存 → finalized（已封存單的 stale 不再觸發重算態）', () => {
        expect(
            deriveStatus([rec({ is_finalized: true }), rec({ is_finalized: true, breakdown_stale: true })]),
        ).toBe('finalized')
    })
})

describe('detectAnomalies', () => {
    const prev = [rec({ net_salary: 30000, gross_salary: 33000 })]

    it('與上月差異 ≥10% 觸發（邊界含）', () => {
        const out = detectAnomalies([rec({ net_salary: 33000, gross_salary: 33000 })], prev, DEFAULT_THRESHOLDS)
        expect(out.get('E1')?.some((r) => r.type === 'diff' && r.field === 'net_salary')).toBe(true)
    })

    it('差異 <10% 且 <$3000 不觸發', () => {
        const out = detectAnomalies([rec({ net_salary: 31000, gross_salary: 33000 })], prev, DEFAULT_THRESHOLDS)
        expect(out.has('E1')).toBe(false)
    })

    it('絕對額 ≥$3000 即使 <10% 也觸發（34000 vs 31000：abs=3000、pct≈9.7%）', () => {
        const out = detectAnomalies(
            [rec({ net_salary: 34000, gross_salary: 36000 })],
            [rec({ net_salary: 31000, gross_salary: 36000 })],
            DEFAULT_THRESHOLDS,
        )
        expect(out.get('E1')?.some((r) => r.type === 'diff' && r.field === 'net_salary')).toBe(true)
    })

    it('manual_overrides 觸發 manual', () => {
        const out = detectAnomalies(
            [rec({ net_salary: 30000, gross_salary: 33000, manual_overrides: ['net_salary'] })],
            prev,
            DEFAULT_THRESHOLDS,
        )
        expect(out.get('E1')?.some((r) => r.type === 'manual')).toBe(true)
    })

    it('本月新進（上月無此人）觸發 new', () => {
        const out = detectAnomalies([rec({ employee_id: 'E9' })], prev, DEFAULT_THRESHOLDS)
        expect(out.get('E9')?.some((r) => r.type === 'new')).toBe(true)
    })

    it('上月空（系統首月）→ 不產生 diff/new', () => {
        expect(detectAnomalies([rec()], [], DEFAULT_THRESHOLDS).size).toBe(0)
    })
})

describe('sortByAttention', () => {
    it('異常列在前、其餘維持原序', () => {
        const a = rec({ employee_id: 'A' })
        const b = rec({ employee_id: 'B' })
        const flags = new Map([['B', [{ type: 'manual' as const }]]])
        expect(sortByAttention([a, b], flags).map((r) => r.employee_id)).toEqual(['B', 'A'])
    })
})

describe('thresholds（localStorage per 裝置）', () => {
    beforeEach(() => localStorage.clear())

    it('無存值時回預設', () => {
        expect(getThresholds()).toEqual({ pct: 0.1, abs: 3000 })
    })

    it('set 後可讀回', () => {
        setThresholds({ pct: 0.2, abs: 5000 })
        expect(getThresholds()).toEqual({ pct: 0.2, abs: 5000 })
    })

    it('壞 JSON 回預設', () => {
        localStorage.setItem('ivy_salary_anomaly_thresholds', '{bad')
        expect(getThresholds()).toEqual({ pct: 0.1, abs: 3000 })
    })
})
