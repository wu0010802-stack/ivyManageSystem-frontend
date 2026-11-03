import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import {
    deriveStatus,
    detectAnomalies,
    sortByAttention,
    getThresholds,
    setThresholds,
    useSalarySettlement,
    DEFAULT_THRESHOLDS,
    type SettlementRecord,
} from '@/composables/useSalarySettlement'
import { getRecords } from '@/api/salary'

vi.mock('@/api/salary', () => ({ getRecords: vi.fn() }))
vi.mock('@/composables/useErrorNotify', () => ({
    useErrorNotify: () => ({ notify: vi.fn() }),
}))

const rec = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    employee_id: 'E1',
    employee_name: '測試',
    version: 1,
    base_salary: 30000,
    gross_salary: 40000,
    net_salary: 36000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    employee_is_active: true,
    employee_resign_date: null,
    ...over,
})

const PERIOD = { year: 2026, month: 10 }

describe('deriveStatus', () => {
    it('無紀錄 → not_calculated', () => {
        expect(deriveStatus([])).toBe('not_calculated')
    })
    it('任一未封存紀錄 breakdown_stale → needs_recalc（優先於覆核中）', () => {
        expect(deriveStatus([rec(), rec({ id: 2, breakdown_stale: true })])).toBe('needs_recalc')
    })
    it('未全封存 → reviewing', () => {
        expect(deriveStatus([rec(), rec({ id: 2, is_finalized: true })])).toBe('reviewing')
    })
    it('全封存 → finalized（已封存單的 stale 不再觸發重算態）', () => {
        expect(deriveStatus([rec({ is_finalized: true, breakdown_stale: true })])).toBe('finalized')
    })
})

describe('detectAnomalies（不比上月：停用仍在名冊／實領 0／扣款偏高／手動調整）', () => {
    it('停用且離職日空白 → inactive', () => {
        const m = detectAnomalies([rec({ employee_is_active: false })], DEFAULT_THRESHOLDS, PERIOD)
        expect(m.get('E1')).toEqual([{ type: 'inactive', resignDate: null }])
    })

    it('離職日早於本月 1 日 → inactive；離職日在本月內 → 正常（本月按日計薪）', () => {
        const m = detectAnomalies(
            [
                rec({ employee_id: 'A', employee_is_active: false, employee_resign_date: '2026-09-30' }),
                rec({ employee_id: 'B', employee_is_active: false, employee_resign_date: '2026-10-01' }),
                rec({ employee_id: 'C', employee_is_active: false, employee_resign_date: '2026-10-15' }),
            ],
            DEFAULT_THRESHOLDS,
            PERIOD,
        )
        expect(m.get('A')).toEqual([{ type: 'inactive', resignDate: '2026-09-30' }])
        expect(m.has('B')).toBe(false)
        expect(m.has('C')).toBe(false)
    })

    it('舊後端沒帶 employee_is_active → 不判 inactive', () => {
        const r = rec()
        delete (r as Record<string, unknown>).employee_is_active
        expect(detectAnomalies([r], DEFAULT_THRESHOLDS, PERIOD).size).toBe(0)
    })

    it('實領（含未休折現的主薪轉）為 0 → zero', () => {
        const m = detectAnomalies(
            [rec({ net_salary: 0, base_transfer_amount: 0, gross_salary: 0, base_salary: 0 })],
            DEFAULT_THRESHOLDS,
            PERIOD,
        )
        expect(m.get('E1')).toEqual([{ type: 'zero', amount: 0 }])
    })

    it('實領為負數（保費追溯補收）也標 zero，帶實際金額', () => {
        const m = detectAnomalies([rec({ base_transfer_amount: -500 })], DEFAULT_THRESHOLDS, PERIOD)
        expect(m.get('E1')).toEqual([{ type: 'zero', amount: -500 }])
    })

    it('單項扣款 ≥ 底薪 10%（邊界含）→ heavy，取金額最大的一項', () => {
        const m = detectAnomalies(
            [rec({ base_salary: 30000, absence_deduction: 3000, late_deduction: 3500 })],
            DEFAULT_THRESHOLDS,
            PERIOD,
        )
        expect(m.get('E1')).toEqual([
            { type: 'heavy', field: 'late_deduction', label: '遲到扣款', amount: 3500, pct: 3500 / 30000 },
        ])
    })

    it('扣款 < 門檻、勞健保再高都不算 heavy；底薪 0（時薪）不判 heavy', () => {
        const m = detectAnomalies(
            [
                rec({ employee_id: 'A', base_salary: 30000, absence_deduction: 2999, labor_insurance: 9999 }),
                rec({ employee_id: 'B', base_salary: 0, leave_deduction: 500 }),
            ],
            DEFAULT_THRESHOLDS,
            PERIOD,
        )
        expect(m.size).toBe(0)
    })

    it('門檻可調（heavyPct=0.5）', () => {
        const m = detectAnomalies(
            [rec({ base_salary: 30000, absence_deduction: 9000 })],
            { heavyPct: 0.5 },
            PERIOD,
        )
        expect(m.size).toBe(0)
    })

    it('manual_overrides 觸發 manual，帶欄位清單', () => {
        const m = detectAnomalies([rec({ manual_overrides: ['supervisor_dividend'] })], DEFAULT_THRESHOLDS, PERIOD)
        expect(m.get('E1')).toEqual([{ type: 'manual', fields: ['supervisor_dividend'] }])
    })

    it('多種原因可並存，依嚴重度排序（inactive → zero → heavy → manual）', () => {
        const m = detectAnomalies(
            [
                rec({
                    employee_is_active: false,
                    manual_overrides: ['net_salary'],
                    net_salary: 0,
                    base_transfer_amount: 0,
                }),
            ],
            DEFAULT_THRESHOLDS,
            PERIOD,
        )
        expect(m.get('E1')?.map((r) => r.type)).toEqual(['inactive', 'zero', 'manual'])
    })
})

describe('sortByAttention', () => {
    it('依最嚴重原因排序，其餘維持原序', () => {
        const records = [
            rec({ employee_id: 'N1' }),
            rec({ employee_id: 'M', manual_overrides: ['x'] }),
            rec({ employee_id: 'N2' }),
            rec({ employee_id: 'I', employee_is_active: false }),
        ]
        const sorted = sortByAttention(records, detectAnomalies(records, DEFAULT_THRESHOLDS, PERIOD))
        expect(sorted.map((r) => r.employee_id)).toEqual(['I', 'M', 'N1', 'N2'])
    })
})

describe('thresholds（per 裝置）', () => {
    beforeEach(() => localStorage.clear())

    it('無存值時回預設（扣款偏高 10%）', () => {
        expect(DEFAULT_THRESHOLDS).toEqual({ heavyPct: 0.1 })
        expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS)
    })
    it('set 後可讀回', () => {
        setThresholds({ heavyPct: 0.2 })
        expect(getThresholds()).toEqual({ heavyPct: 0.2 })
    })
    it('舊版上月差異門檻 {pct, abs} 不沿用 → 回預設', () => {
        localStorage.setItem('ivy_salary_anomaly_thresholds', JSON.stringify({ pct: 0.3, abs: 100 }))
        expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS)
    })
    it('壞 JSON 回預設', () => {
        localStorage.setItem('ivy_salary_review_thresholds', '{bad')
        expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS)
    })
})

describe('useSalarySettlement refresh（async race）', () => {
    interface PendingCall {
        year: number
        month: number
        resolve: (v: { data: unknown[] }) => void
    }

    const flush = () => new Promise((r) => setTimeout(r))

    it('只抓當月（不再抓上月）；切月後舊月慢回應不得蓋掉新月資料', async () => {
        const calls: PendingCall[] = []
        vi.mocked(getRecords).mockImplementation(
            (year: number, month: number) =>
                new Promise((resolve) => {
                    calls.push({ year, month, resolve })
                }) as ReturnType<typeof getRecords>,
        )

        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)

        void s.refresh() // calls[0]=(2026,5)
        month.value = 4 // watch 觸發第二個 refresh
        await nextTick() // calls[1]=(2026,4)
        expect(calls.map((c) => [c.year, c.month])).toEqual([
            [2026, 5],
            [2026, 4],
        ])

        calls[1].resolve({ data: [rec({ employee_name: 'APR' })] })
        await flush()
        expect(s.records.value[0]?.employee_name).toBe('APR')

        calls[0].resolve({ data: [rec({ employee_name: 'MAY' })] })
        await flush()
        expect(s.records.value[0]?.employee_name).toBe('APR')
        expect(s.loading.value).toBe(false)
    })
})

describe('useSalarySettlement currentLoadFailed（當月載入失敗清空殘留）', () => {
    it('當月請求失敗 → 清空 records 並設 currentLoadFailed，避免殘留上一個月名冊', async () => {
        vi.mocked(getRecords).mockImplementation(
            () => Promise.resolve({ data: [rec({ employee_name: 'MAY' })] }) as ReturnType<typeof getRecords>,
        )
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        expect(s.records.value.length).toBe(1)
        expect(s.currentLoadFailed.value).toBe(false)

        vi.mocked(getRecords).mockImplementation(
            () => Promise.reject(new Error('500')) as ReturnType<typeof getRecords>,
        )
        await s.refresh()
        expect(s.records.value).toEqual([])
        expect(s.currentLoadFailed.value).toBe(true)
        expect(s.loading.value).toBe(false)
    })

    it('當月載入失敗後再次成功 → currentLoadFailed 復位', async () => {
        vi.mocked(getRecords).mockImplementation(
            () => Promise.reject(new Error('500')) as ReturnType<typeof getRecords>,
        )
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        expect(s.currentLoadFailed.value).toBe(true)

        vi.mocked(getRecords).mockImplementation(
            () => Promise.resolve({ data: [rec()] }) as ReturnType<typeof getRecords>,
        )
        await s.refresh()
        expect(s.currentLoadFailed.value).toBe(false)
        expect(s.records.value.length).toBe(1)
    })

    it('anomalies 依當前 year/month 判斷離職日', async () => {
        vi.mocked(getRecords).mockImplementation(
            () =>
                Promise.resolve({
                    data: [rec({ employee_is_active: false, employee_resign_date: '2026-05-10' })],
                }) as ReturnType<typeof getRecords>,
        )
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        expect(s.anomalies.value.size).toBe(0) // 5 月內離職：正常

        month.value = 6
        await nextTick()
        await new Promise((r) => setTimeout(r))
        expect(s.anomalies.value.get('E1')?.[0]?.type).toBe('inactive') // 6 月仍在名冊：標出
    })
})
