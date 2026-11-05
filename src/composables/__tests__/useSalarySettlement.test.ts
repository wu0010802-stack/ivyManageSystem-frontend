import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick, reactive, toRef, defineComponent, h, inject, provide, onMounted } from 'vue'
import {
    deriveStatus,
    detectAnomalies,
    sortByAttention,
    getThresholds,
    setThresholds,
    useSalarySettlement,
    DEFAULT_THRESHOLDS,
    type SalarySettlement,
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

    it('分母用契約月薪：月中到職者本月底薪很小也不誤報（業主 2026-11-03 裁定）', () => {
        const m = detectAnomalies(
            [rec({ base_salary: 3000, contract_base_salary: 30000, leave_deduction: 1000 })],
            DEFAULT_THRESHOLDS,
            PERIOD,
        )
        expect(m.size).toBe(0)
    })

    it('舊後端沒帶 contract_base_salary → 退回本月底薪', () => {
        const m = detectAnomalies([rec({ base_salary: 3000, leave_deduction: 1000 })], DEFAULT_THRESHOLDS, PERIOD)
        expect(m.get('E1')?.[0]?.type).toBe('heavy')
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

describe('useSalarySettlement 切換年月（舊月名冊不得殘留到新月載入完成前）', () => {
    interface PendingCall {
        year: number
        month: number
        resolve: (v: { data: unknown[] }) => void
        reject: (e: unknown) => void
    }

    const flush = () => new Promise((r) => setTimeout(r))

    /** 之後的 getRecords 一律回 pending promise，由測試手動 resolve／reject。 */
    const mockPending = (): PendingCall[] => {
        const calls: PendingCall[] = []
        vi.mocked(getRecords).mockImplementation(
            (year: number, month: number) =>
                new Promise((resolve, reject) => {
                    calls.push({ year, month, resolve, reject })
                }) as ReturnType<typeof getRecords>,
        )
        return calls
    }

    /** 建立 composable 並先載入一個月（5 月）的名冊。 */
    const loadedMay = async (mayRecords: SettlementRecord[]) => {
        vi.mocked(getRecords).mockImplementation(
            () => Promise.resolve({ data: mayRecords }) as ReturnType<typeof getRecords>,
        )
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        return { year, month, s }
    }

    it('切月後 records 立即清空；新月載入完成前 status 不沿用舊月（loading 中）', async () => {
        const { month, s } = await loadedMay([
            rec({ employee_name: 'MAY', is_finalized: true, manual_overrides: ['x'] }),
        ])
        expect(s.status.value).toBe('finalized')
        expect(s.finalizedCount.value).toBe(1)
        expect(s.anomalies.value.size).toBe(1)

        const calls = mockPending()
        month.value = 4
        await nextTick()

        expect(calls.map((c) => [c.year, c.month])).toEqual([[2026, 4]])
        expect(s.records.value).toEqual([])
        expect(s.loading.value).toBe(true)
        expect(s.status.value).toBe('not_calculated')
        expect(s.finalizedCount.value).toBe(0)
        expect(s.anomalies.value.size).toBe(0)

        calls[0].resolve({ data: [rec({ employee_name: 'APR' })] })
        await flush()
        expect(s.records.value.map((r) => r.employee_name)).toEqual(['APR'])
        expect(s.loading.value).toBe(false)
    })

    it('切年（跨年）同樣清空舊名冊', async () => {
        const { year, s } = await loadedMay([rec({ employee_name: 'MAY' })])
        const calls = mockPending()
        year.value = 2025
        await nextTick()

        expect(calls.map((c) => [c.year, c.month])).toEqual([[2025, 5]])
        expect(s.records.value).toEqual([])
        expect(s.loading.value).toBe(true)
    })

    it('前一月載入失敗，切月後 currentLoadFailed 立即復位（不沿用上月失敗旗標）', async () => {
        vi.mocked(getRecords).mockImplementation(
            () => Promise.reject(new Error('500')) as ReturnType<typeof getRecords>,
        )
        const year = ref(2026)
        const month = ref(5)
        const s = useSalarySettlement(year, month)
        await s.refresh()
        expect(s.currentLoadFailed.value).toBe(true)

        const calls = mockPending()
        month.value = 4
        await nextTick()

        expect(s.currentLoadFailed.value).toBe(false)
        expect(s.loading.value).toBe(true)
        expect(calls).toHaveLength(1)
    })

    it('切月後新月載入失敗 → records 為空、currentLoadFailed 為 true、loading 結束', async () => {
        const { month, s } = await loadedMay([rec({ employee_name: 'MAY' })])
        const calls = mockPending()
        month.value = 4
        await nextTick()

        calls[0].reject(new Error('500'))
        await flush()

        expect(s.records.value).toEqual([])
        expect(s.currentLoadFailed.value).toBe(true)
        expect(s.loading.value).toBe(false)
    })

    it('快速連續切月 5→4→3：4 月回應在 3 月仍 pending 時到達，不得顯示 4 月名冊', async () => {
        const { month, s } = await loadedMay([rec({ employee_name: 'MAY' })])
        const calls = mockPending()
        month.value = 4
        await nextTick()
        month.value = 3
        await nextTick()
        expect(calls.map((c) => [c.year, c.month])).toEqual([
            [2026, 4],
            [2026, 3],
        ])

        calls[0].resolve({ data: [rec({ employee_name: 'APR' })] })
        await flush()
        expect(s.records.value).toEqual([]) // 4 月是晚到的舊請求：丟棄，不是新月名冊
        expect(s.loading.value).toBe(true) // 3 月仍在載入

        calls[1].resolve({ data: [rec({ employee_name: 'MAR' })] })
        await flush()
        expect(s.records.value.map((r) => r.employee_name)).toEqual(['MAR'])
        expect(s.loading.value).toBe(false)
    })

    it('快速連續切月 5→4→3：4 月的晚到失敗不得清掉 3 月已載入的名冊或設失敗旗標', async () => {
        const { month, s } = await loadedMay([rec({ employee_name: 'MAY' })])
        const calls = mockPending()
        month.value = 4
        await nextTick()
        month.value = 3
        await nextTick()

        calls[1].resolve({ data: [rec({ employee_name: 'MAR' })] })
        await flush()
        calls[0].reject(new Error('500'))
        await flush()

        expect(s.records.value.map((r) => r.employee_name)).toEqual(['MAR'])
        expect(s.currentLoadFailed.value).toBe(false)
        expect(s.loading.value).toBe(false)
    })

    it('一般 refresh（例如定案後重抓）不清空畫面：載入中仍保留現有名冊，回應後才換新', async () => {
        const { s } = await loadedMay([rec({ employee_name: 'MAY' })])
        const calls = mockPending()

        const pending = s.refresh()
        await nextTick()
        expect(s.loading.value).toBe(true)
        expect(s.records.value.map((r) => r.employee_name)).toEqual(['MAY']) // 不閃空

        calls[0].resolve({ data: [rec({ employee_name: 'MAY', is_finalized: true })] })
        await pending
        expect(s.records.value[0]?.is_finalized).toBe(true)
        expect(s.loading.value).toBe(false)
    })

    it('一般 refresh 失敗仍沿用既有行為：清空並標記載入失敗', async () => {
        const { s } = await loadedMay([rec({ employee_name: 'MAY' })])
        const calls = mockPending()

        const pending = s.refresh()
        calls[0].reject(new Error('500'))
        await pending

        expect(s.records.value).toEqual([])
        expect(s.currentLoadFailed.value).toBe(true)
        expect(s.loading.value).toBe(false)
    })
})

// SalarySettleView 以 `:key="步驟:年-月"` 在切月時重掛步驟元件，而 useSalarySettlement 的 watch 與該 view
// 同屬一個元件實例。watch 必須維持預設的 pre-flush：先清空名冊、重抓（loading=true），父層才 render
// 並 setup 新步驟，新步驟因此一開始就看到「空名冊 + 載入中」。若改成 flush: 'post'，新步驟會先以舊月名冊
// 首次渲染（定案／計算鈕在那一幀還可按），之後才被清空。這裡用「真 composable + 帶 :key 的重掛元件」鎖住時序。
describe('useSalarySettlement 與 :key 重掛步驟的時序（watch 須為 pre-flush）', () => {
    beforeEach(() => {
        vi.mocked(getRecords).mockReset()
    })

    interface Seen { month: number; count: number; loading: boolean; failed: boolean }

    it('切月重掛的新步驟在 setup 當下就看到空名冊與載入中（不得先以舊月名冊渲染一幀）', async () => {
        const seen: Seen[] = []
        const query = reactive({ year: 2026, month: 5 })
        let settlement!: SalarySettlement

        const Probe = defineComponent({
            props: { month: { type: Number, required: true } },
            setup(props) {
                const s = inject<SalarySettlement>('settlement')!
                seen.push({
                    month: props.month,
                    count: s.records.value.length,
                    loading: s.loading.value,
                    failed: s.currentLoadFailed.value,
                })
                return () => h('div', { class: 'probe' }, String(props.month))
            },
        })
        const Host = defineComponent({
            setup() {
                settlement = useSalarySettlement(toRef(query, 'year'), toRef(query, 'month'))
                provide('settlement', settlement)
                onMounted(settlement.refresh)
                return () => h(Probe, { key: `${query.year}-${query.month}`, month: query.month })
            },
        })

        vi.mocked(getRecords).mockResolvedValueOnce({
            data: [rec({ employee_name: 'MAY-1' }), rec({ id: 2, employee_id: 'E2', employee_name: 'MAY-2' })],
        } as Awaited<ReturnType<typeof getRecords>>)
        const wrapper = mount(Host)
        await flushPromises()
        expect(settlement.records.value).toHaveLength(2)
        expect(seen).toEqual([{ month: 5, count: 0, loading: false, failed: false }]) // 首次掛載時尚未載入

        // 4 月請求 pending：切月瞬間 Probe 以 :key 重掛
        let resolveApril!: (v: Awaited<ReturnType<typeof getRecords>>) => void
        vi.mocked(getRecords).mockReturnValueOnce(
            new Promise((resolve) => { resolveApril = resolve }) as ReturnType<typeof getRecords>,
        )
        query.month = 4
        await nextTick()

        expect(seen).toHaveLength(2)
        expect(seen[1]).toEqual({ month: 4, count: 0, loading: true, failed: false })
        expect(wrapper.find('.probe').text()).toBe('4')

        resolveApril({ data: [rec({ employee_name: 'APR-1' })] } as Awaited<ReturnType<typeof getRecords>>)
        await flushPromises()
        expect(settlement.records.value.map((r) => r.employee_name)).toEqual(['APR-1'])
        expect(settlement.loading.value).toBe(false)
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
