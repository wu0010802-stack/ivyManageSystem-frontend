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

describe('useSalarySettlement refresh（async race）', () => {
    interface PendingCall {
        year: number
        month: number
        resolve: (v: { data: unknown[] }) => void
    }

    const flush = () => new Promise((r) => setTimeout(r))

    it('切月後舊月慢回應不得蓋掉新月資料', async () => {
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

        void s.refresh() // 5 月（慢）：calls[0]=(2026,5)、calls[1]=(2026,4 prev)
        month.value = 4 // watch 觸發第二個 refresh
        await nextTick() // calls[2]=(2026,4)、calls[3]=(2026,3 prev)
        expect(calls).toHaveLength(4)

        // 4 月（新）先回
        calls[2].resolve({ data: [rec({ employee_name: 'APR' })] })
        calls[3].resolve({ data: [] })
        await flush()
        expect(s.records.value[0]?.employee_name).toBe('APR')

        // 5 月（舊）慢回——不得蓋掉 4 月資料
        calls[0].resolve({ data: [rec({ employee_name: 'MAY' })] })
        calls[1].resolve({ data: [] })
        await flush()
        expect(s.records.value[0]?.employee_name).toBe('APR')
        expect(s.loading.value).toBe(false)
    })
})

describe('useSalarySettlement currentLoadFailed（當月載入失敗清空殘留）', () => {
    it('當月請求失敗 → 清空 records/prevRecords 並設 currentLoadFailed，避免殘留上一個月名冊', async () => {
        // 先成功載入 5 月 → records 有值
        vi.mocked(getRecords).mockImplementation(
            () => Promise.resolve({ data: [rec({ employee_name: 'MAY' })] }) as ReturnType<typeof getRecords>,
        )
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        expect(s.records.value.length).toBe(1)
        expect(s.currentLoadFailed.value).toBe(false)

        // 當月請求改為 500（模擬切到會失敗的月份）→ 名冊須清空，不得殘留 MAY
        vi.mocked(getRecords).mockImplementation(
            () => Promise.reject(new Error('500')) as ReturnType<typeof getRecords>,
        )
        await s.refresh()
        expect(s.records.value).toEqual([])
        expect(s.prevRecords.value).toEqual([])
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
})

describe('useSalarySettlement prevLoadFailed（上月載入失敗旗標）', () => {
    it('上月請求失敗 → prevLoadFailed=true；成功 → false', async () => {
        vi.mocked(getRecords).mockImplementation((year: number, month: number) => {
            if (month === 4) return Promise.reject(new Error('500'))
            return Promise.resolve({ data: [rec()] }) as ReturnType<typeof getRecords>
        })
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        expect(s.prevLoadFailed.value).toBe(true)
        expect(s.prevRecords.value).toEqual([])

        // 改成上月也成功 → 旗標復位
        vi.mocked(getRecords).mockImplementation(
            () => Promise.resolve({ data: [rec()] }) as ReturnType<typeof getRecords>,
        )
        await s.refresh()
        expect(s.prevLoadFailed.value).toBe(false)
    })
})
