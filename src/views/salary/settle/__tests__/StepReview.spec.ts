import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import StepReview from '../StepReview.vue'
import AdjustDrawer from '../AdjustDrawer.vue'
import { ElMessageBox } from 'element-plus'
import {
    detectAnomalies,
    sortByAttention,
    DEFAULT_THRESHOLDS,
    type SettlementRecord,
} from '@/composables/useSalarySettlement'

vi.mock('@/api/salary', () => ({
    getSalaryFieldBreakdown: vi.fn(),
    manualAdjustSalary: vi.fn(),
}))
vi.mock('@/api/yearEnd', () => ({ listAppraisalPayouts: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('element-plus')>()
    return {
        ...actual,
        // info 不可漏：AdjustDrawer 在「沒有任何欄位變動」時走 ElMessage.info 提早返回，
        // mock 缺這支會讓元件在 save() 內丟 TypeError、被 catch 吞成「網路連線異常」，
        // 三條斷言連帶假紅（2026-09-21 發現時這三條已在 staging 紅著、守衛實際失效）。
        ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        ElMessageBox: { alert: vi.fn().mockResolvedValue('confirm') },
    }
})

import { manualAdjustSalary } from '@/api/salary'
import { ElMessage } from 'element-plus'

const rec = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    employee_id: 'E1',
    employee_name: '測試',
    version: 3,
    base_salary: 36000,
    gross_salary: 40000,
    net_salary: 36000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    employee_is_active: true,
    employee_resign_date: null,
    ...over,
})

const makeSettlement = (records: SettlementRecord[]) => {
    const recordsRef = ref(records)
    const thresholds = ref({ ...DEFAULT_THRESHOLDS })
    const anomalies = computed(() => detectAnomalies(recordsRef.value, thresholds.value, { year: 2026, month: 5 }))
    return {
        records: recordsRef,
        currentLoadFailed: ref(false),
        loading: ref(false),
        anomalies,
        sortedRecords: computed(() => sortByAttention(recordsRef.value, anomalies.value)),
        thresholds,
        refresh: vi.fn(),
    }
}

const STUBS = {
    'el-card': { template: '<div><slot /></div>' },
    'el-table': true,
    'el-table-column': true,
    'router-link': { template: '<a><slot /></a>' },
    BatchAdjustDialog: true,
    FieldBreakdownDrawer: true,
    'el-popover': true,
    'el-form': true,
    'el-form-item': true,
    'el-input': true,
    'el-input-number': true,
    'el-button': { template: '<button><slot /></button>' },
    'el-dialog': true,
    'el-tag': true,
    'el-tooltip': { template: '<div><slot /></div>' },
    'el-icon': true,
    teleport: true,
}

interface ReviewVm {
    visibleRecords: SettlementRecord[]
    activeFilter: string
    chips: { key: string; label: string; count: number }[]
    classSubLabel: (row: SettlementRecord) => string
    deltaClass: (row: SettlementRecord) => string
    deltaLabel: (row: SettlementRecord) => string
    deltaTip: (row: SettlementRecord) => string
    prevHeaderText: string
}

const mountReview = (settlement: ReturnType<typeof makeSettlement>, extraStubs = {}) =>
    mount(StepReview, {
        global: {
            stubs: { ...STUBS, ...extraStubs },
            provide: { settlement, settleQuery: { year: 2026, month: 5 } },
        },
    })

const headBreakdown = (total: number, target: number | null) => ({
    enrollment: {
        snapshot_date: '2026-05-31',
        total,
        classroom_id: 1,
        classroom_name: '蒲公英',
        grade_name: '大班',
        multi_head: false,
        target,
        overtime_target: 33,
    },
    assistant: null,
})

describe('StepReview', () => {
    it('需注意列依嚴重度排前；chip 篩選正確', async () => {
        const settlement = makeSettlement([
            rec({ employee_id: 'A' }), // 正常
            rec({ employee_id: 'M', manual_overrides: ['festival_bonus'] }), // 手動調整
            rec({ employee_id: 'I', employee_is_active: false }), // 停用仍在名冊
        ])
        const vm = mountReview(settlement).vm as unknown as ReviewVm
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['I', 'M', 'A'])

        vm.activeFilter = 'attention'
        await flushPromises()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['I', 'M'])

        vm.activeFilter = 'inactive'
        await flushPromises()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['I'])
    })

    it('chip 只列有人的需注意類型，計數正確', () => {
        const settlement = makeSettlement([
            rec({ employee_id: 'A', net_salary: 0, base_transfer_amount: 0 }),
            rec({ employee_id: 'B', absence_deduction: 16102 }),
            rec({ employee_id: 'C' }),
        ])
        const vm = mountReview(settlement).vm as unknown as ReviewVm
        expect(vm.chips.map((c) => [c.key, c.count])).toEqual([
            ['all', 3],
            ['attention', 2],
            ['zero', 1],
            ['heavy', 1],
        ])
    })

    it('班級未達目標人數 chip：在籍 < 目標才算，目標未設定不算', async () => {
        const settlement = makeSettlement([
            rec({ employee_id: 'A', breakdown: headBreakdown(28, 30) }),
            rec({ employee_id: 'B', breakdown: headBreakdown(31, 30) }),
            rec({ employee_id: 'C', breakdown: headBreakdown(20, null) }),
            rec({ employee_id: 'D' }),
        ])
        const vm = mountReview(settlement).vm as unknown as ReviewVm
        expect(vm.chips.find((c) => c.key === 'below')?.count).toBe(1)
        vm.activeFilter = 'below'
        await flushPromises()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['A'])
    })

    it('不帶班的人顯示全園在籍／目標（參考），不算進「人數未達目標」', async () => {
        const schoolRef = { enrollment: null, assistant: null, festival_basis: null,
            school: { basis: null, total: 152, target: 160, snapshot_date: '2026-05-31' } }
        const schoolSup = { enrollment: null, assistant: null, festival_basis: 'supervisor',
            school: { basis: 'supervisor', total: 152, target: 160, snapshot_date: '2026-05-31' } }
        const settlement = makeSettlement([
            rec({ employee_id: 'K', breakdown: { ...schoolRef, school: { ...schoolRef.school, prev_total: 155 } } }),
            rec({ employee_id: 'S', breakdown: { ...schoolSup, school: { ...schoolSup.school, prev_total: 155 } } }),
        ])
        const vm = mountReview(settlement).vm as unknown as ReviewVm
        const [k, s] = settlement.records.value
        expect(vm.classSubLabel(k)).toBe('不帶班 · 參考')
        expect(vm.classSubLabel(s)).toBe('主管 · 全園比例')
        // 全園較上月：參考列照顯示但不上色（不影響本人薪資）；主管列照常上色
        expect(vm.deltaLabel(k)).toBe('−3')
        expect(vm.deltaClass(k)).toBe('is-muted')
        expect(vm.deltaClass(s)).toBe('gap-below')
        expect(vm.chips.find((c) => c.key === 'below')?.count).toBe(1)
        vm.activeFilter = 'below'
        await flushPromises()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['S'])
    })

    it('底部操作列：需注意摘要點出停用與實領 0', () => {
        const settlement = makeSettlement([
            rec({ employee_id: 'I', employee_is_active: false }),
            rec({ employee_id: 'Z', net_salary: 0, base_transfer_amount: 0 }),
        ])
        const text = mountReview(settlement).text()
        expect(text).toContain('需注意 2 位')
        expect(text).toContain('1 位已停用仍在名冊')
        expect(text).toContain('1 位實領 ≤ 0')
        expect(text).toContain('確認無誤，進入定案')
    })

    it('沒有需注意 → 操作列顯示「沒有需注意的人」', () => {
        const text = mountReview(makeSettlement([rec()])).text()
        expect(text).toContain('沒有需注意的人')
    })

    it('不顯示薪資金額與上月的比較（人數較上月除外）', () => {
        const text = mountReview(makeSettlement([rec()])).text()
        expect(text).not.toContain('上月實領')
        expect(text).not.toContain('與上月差')
    })

    it('人數差距＝較上月：本月 − 上月同一班，增加／減少分別上色', () => {
        const prevOk = { year: 2026, month: 4, comparable: true, reason: null }
        const withPrev = (total: number, prev: number | null) => ({
            ...headBreakdown(total, 30),
            enrollment: { ...headBreakdown(total, 30).enrollment, prev_total: prev },
            prev_month: prevOk,
        })
        const settlement = makeSettlement([
            rec({ employee_id: 'U', breakdown: withPrev(29, 27) }),
            rec({ employee_id: 'D', breakdown: withPrev(26, 28) }),
            rec({ employee_id: 'F', breakdown: withPrev(28, 28) }),
            rec({ employee_id: 'N', breakdown: withPrev(12, null) }),
            rec({ employee_id: 'X' }),
        ])
        const vm = mountReview(settlement).vm as unknown as ReviewVm
        const [u, d, f, n, x] = settlement.records.value
        expect([u, d, f, n, x].map(vm.deltaLabel)).toEqual(['+2', '−2', '持平', '—', '—'])
        expect(vm.deltaClass(u)).toBe('gap-above')
        expect(vm.deltaClass(d)).toBe('gap-below')
        expect(vm.deltaClass(f)).toBe('')
        expect(vm.deltaClass(n)).toBe('is-muted')
        expect(vm.deltaTip(u)).toBe('4 月 27 人 → 本月 29 人')
        expect(vm.deltaTip(n)).toBe('上月（4 月）還沒有這個班')
        expect(vm.prevHeaderText).toBe('本月在籍 − 上月（4 月）同一班在籍；不帶班者比全園人數。不跨學年比較。')
    })

    it('學年第一個月（8 月）不跨學年比較：全部 —，表頭說明新學年', () => {
        const cross = { year: 2026, month: 7, comparable: false, reason: 'cross_school_year' }
        const bd = { ...headBreakdown(28, 30), enrollment: { ...headBreakdown(28, 30).enrollment, prev_total: null }, prev_month: cross }
        const settlement = makeSettlement([rec({ employee_id: 'A', breakdown: bd })])
        const vm = mountReview(settlement).vm as unknown as ReviewVm
        const [a] = settlement.records.value
        expect(vm.deltaLabel(a)).toBe('—')
        expect(vm.deltaClass(a)).toBe('is-muted')
        expect(vm.prevHeaderText).toBe('本月是新學年第一個月，不與上一學年（7 月）比較。')
    })

    it('當月載入失敗 → 顯示載入失敗，不誤導成「尚未計算」', () => {
        const settlement = makeSettlement([])
        settlement.currentLoadFailed.value = true
        const text = mountReview(settlement, { EmptyState: { props: ['title'], template: '<div>{{ title }}<slot /></div>' } }).text()
        expect(text).toContain('本月薪資載入失敗')
        expect(text).not.toContain('本月尚未計算薪資')
    })

    it('本月全為 0 的欄收合提示列出欄名', () => {
        const text = mountReview(makeSettlement([rec()])).text()
        expect(text).toContain('本月全為 0、已收合')
        expect(text).toContain('節慶獎金')
    })

    it('點欄位明細：有 record id 開右側抽屜帶入人與欄位；無 id 警告', async () => {
        const settlement = makeSettlement([rec({ id: 12 })])
        const vm = mountReview(settlement).vm as unknown as {
            openFieldBreakdown: (row: SettlementRecord, field: string) => void
            showFieldBreakdown: boolean
            breakdownField: string
            breakdownRow: SettlementRecord | null
        }
        vm.openFieldBreakdown(settlement.records.value[0], 'base_salary')
        expect(vm.showFieldBreakdown).toBe(true)
        expect(vm.breakdownField).toBe('base_salary')
        expect(vm.breakdownRow?.id).toBe(12)

        const { ElMessage } = await import('element-plus')
        vm.showFieldBreakdown = false
        vm.openFieldBreakdown(rec({ id: 0 }), 'base_salary')
        expect(vm.showFieldBreakdown).toBe(false)
        expect(vi.mocked(ElMessage.warning)).toHaveBeenCalled()
    })
})

describe('AdjustDrawer', () => {
    const DRAWER_STUBS = {
        'el-drawer': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-alert': true,
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input-number': true,
        'el-input': true,
        'el-button': { template: '<button><slot /></button>' },
        teleport: true,
    }

    beforeEach(() => {
        vi.mocked(manualAdjustSalary).mockReset()
        vi.mocked(ElMessageBox.alert).mockResolvedValue('confirm' as never)
    })

    it('儲存成功 → emit saved + 關閉；payload 帶 If-Match version', async () => {
        vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
        const row = rec({ id: 77, version: 5, extra_allowance_label: '值週' })
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as {
            reason: string
            extraAllowanceLabel: string
            save: () => Promise<void>
        }
        vm.reason = '主管核准一次性獎勵'
        // 新契約（見 AdjustDrawer.patch.spec.ts）：payload 只帶「相對 row 有變動」的欄位，
        // 完全沒動金額或名目時直接提早返回不打 API。所以要送出必須真的改一個欄位。
        vm.extraAllowanceLabel = '導師加給'
        await vm.save()
        expect(manualAdjustSalary).toHaveBeenCalledWith(
            77,
            expect.objectContaining({ adjustment_reason: '主管核准一次性獎勵', extra_allowance_label: '導師加給' }),
            5,
        )
        expect(wrapper.emitted('saved')).toBeTruthy()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    it('原因 <5 字 → 不送出', async () => {
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row: rec({ id: 77 }) },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as { reason: string; save: () => Promise<void> }
        vm.reason = '短'
        await vm.save()
        expect(manualAdjustSalary).not.toHaveBeenCalled()
    })

    it('409 版本衝突 → alert 後 emit saved（外層重載）', async () => {
        vi.mocked(manualAdjustSalary).mockRejectedValue({ response: { status: 409, data: { detail: '已被修改' } } })
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row: rec({ id: 77 }) },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as {
            reason: string
            extraAllowanceLabel: string
            save: () => Promise<void>
        }
        vm.reason = '誤算修正補登'
        vm.extraAllowanceLabel = '導師加給'
        await vm.save()
        await flushPromises()
        expect(ElMessageBox.alert).toHaveBeenCalled()
        expect(wrapper.emitted('saved')).toBeTruthy()
    })

    it('編輯其他欄位時不把已存的額外加給靜默歸零（回歸，原 SalaryView.test.js）', async () => {
        vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
        // row 來自 DB records，自帶 extra_allowance=500；只改名目、不動金額。
        // 舊契約是「整包送出」，所以守衛盯的是「500 有沒有被送成 0」；
        // 新契約改成只送變動欄位（AdjustDrawer.patch.spec.ts），同一個危害要改盯
        // 「extra_allowance 根本不該出現在 payload 裡」——出現就代表前端又在替
        // 一個沒被編輯的金額欄位下值，後端會照單覆寫。
        const row = rec({ id: 88, extra_allowance: 500, extra_allowance_label: '值週' })
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as {
            reason: string
            extraAllowanceLabel: string
            save: () => Promise<void>
        }
        vm.reason = '只調整加給名目不動金額'
        vm.extraAllowanceLabel = '導師加給'
        await vm.save()
        expect(manualAdjustSalary).toHaveBeenCalledWith(
            88,
            expect.objectContaining({ extra_allowance_label: '導師加給' }),
            expect.anything(),
        )
        const payload = vi.mocked(manualAdjustSalary).mock.calls[0][1] as Record<string, unknown>
        expect(payload).not.toHaveProperty('extra_allowance')
    })

    it('已封存列 → 儲存按鈕 disabled', () => {
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row: rec({ is_finalized: true }) },
            global: {
                stubs: {
                    ...DRAWER_STUBS,
                    'el-button': { template: '<button :disabled="disabled"><slot /></button>', props: ['disabled'] },
                },
            },
        })
        const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('儲存'))
        expect(saveBtn!.attributes('disabled')).toBeDefined()
    })
})

describe('StepReview 姓名搜尋', () => {
    it('reviewSearch 以姓名過濾 visibleRecords', async () => {
        const settlement = makeSettlement([
            rec({ employee_id: 'E1', employee_name: '王小明' }),
            rec({ employee_id: 'E2', employee_name: '陳大文' }),
            rec({ employee_id: 'E3', employee_name: '王美麗' }),
        ])
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        const vm = wrapper.vm as unknown as { reviewSearch: string; visibleRecords: { employee_id: string }[] }
        expect(vm.visibleRecords).toHaveLength(3)
        vm.reviewSearch = '王'
        await wrapper.vm.$nextTick()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['E1', 'E3'])
    })
})

type BatchVm = {
  selectedAdjustRows: SettlementRecord[]
  batchFailures: { id: number; name: string; reason: string }[]
  batchAdjustVisible: boolean
  openBatchAdjust: () => void
  applyBatchAdjust: (p: { field: string; reason: string; items: { id: number; version: number | undefined; value: number }[] }) => Promise<void>
}

describe('StepReview 批次調整', () => {
  beforeEach(() => { vi.mocked(manualAdjustSalary).mockReset() })

  it('每人送自己的絕對值與版本，全部成功 → 關閉、清選取、refresh', async () => {
    vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
    const settlement = makeSettlement([rec({ id: 1, employee_name: '甲' }), rec({ id: 2, employee_name: '乙', employee_id: 'E2' })])
    const vm = mountReview(settlement).vm as unknown as BatchVm
    vm.selectedAdjustRows = settlement.records.value
    vm.openBatchAdjust()
    expect(vm.batchAdjustVisible).toBe(true)
    await vm.applyBatchAdjust({
      field: 'meeting_overtime_pay',
      reason: '10/30 臨時會議補發',
      items: [{ id: 1, version: 3, value: 916 }, { id: 2, version: 5, value: 500 }],
    })
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledWith(1, { meeting_overtime_pay: 916, adjustment_reason: '10/30 臨時會議補發' }, 3)
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledWith(2, { meeting_overtime_pay: 500, adjustment_reason: '10/30 臨時會議補發' }, 5)
    expect(settlement.refresh).toHaveBeenCalled()
    expect(vm.batchAdjustVisible).toBe(false)
    expect(vm.selectedAdjustRows).toEqual([])
  })

  it('部分失敗 → 對話框留著、只剩失敗者並列出原因（409 用白話）', async () => {
    vi.mocked(manualAdjustSalary)
      .mockRejectedValueOnce({ response: { status: 409, data: { detail: 'version conflict' } } })
      .mockResolvedValue({ data: { record: {} } } as never)
    const settlement = makeSettlement([rec({ id: 1, employee_name: '甲' }), rec({ id: 2, employee_name: '乙', employee_id: 'E2' })])
    const vm = mountReview(settlement).vm as unknown as BatchVm
    vm.selectedAdjustRows = settlement.records.value
    vm.openBatchAdjust()
    await vm.applyBatchAdjust({
      field: 'overtime_pay',
      reason: '值週津貼補發',
      items: [{ id: 1, version: 3, value: 300 }, { id: 2, version: 3, value: 300 }],
    })
    expect(settlement.refresh).toHaveBeenCalled()
    expect(vm.batchAdjustVisible).toBe(true)
    expect(vm.batchFailures).toEqual([{ id: 1, name: '甲', reason: '這筆剛被其他人改過' }])
  })
})

describe('StepReview 批次調整分批', () => {
  it('12 人分 3 批送，每批最多 5 筆同時進行', async () => {
    vi.mocked(manualAdjustSalary).mockReset()
    let inFlight = 0
    let peak = 0
    vi.mocked(manualAdjustSalary).mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 0))
      inFlight--
      return { data: { record: {} } } as never
    })
    const settlement = makeSettlement([rec({ id: 1 })])
    const vm = mountReview(settlement).vm as unknown as BatchVm
    const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, version: 1, value: 100 }))
    await vm.applyBatchAdjust({ field: 'overtime_pay', reason: '值週津貼補發', items })
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledTimes(12)
    expect(peak).toBeLessThanOrEqual(5)
  })
})

describe('StepReview 批次調整防連點', () => {
  it('送出中再次觸發 → 第二次直接略過（不重送）', async () => {
    let release: (v: unknown) => void = () => {}
    vi.mocked(manualAdjustSalary).mockReset()
    vi.mocked(manualAdjustSalary).mockImplementation(
      () => new Promise((resolve) => { release = resolve }) as never,
    )
    const settlement = makeSettlement([rec({ id: 1 })])
    const vm = mountReview(settlement).vm as unknown as BatchVm
    const payload = { field: 'overtime_pay', reason: '值週津貼補發', items: [{ id: 1, version: 3, value: 300 }] }
    const first = vm.applyBatchAdjust(payload)
    await vm.applyBatchAdjust(payload)
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledTimes(1)
    release({ data: { record: {} } })
    await first
  })
})


describe('StepReview 需注意門檻輸入防呆', () => {
    interface ThresholdVm {
        heavyPctInput: number | null | undefined
        applyThresholds: () => void
    }
    beforeEach(() => {
        localStorage.clear()
        vi.mocked(ElMessage.warning).mockClear()
        vi.mocked(ElMessage.success).mockClear()
    })

    it.each([[null], [undefined], [Number.NaN], [0], [-5]])('輸入 %s 按套用：不存、不改門檻、提示', async (bad) => {
        const settlement = makeSettlement([rec()])
        const vm = mountReview(settlement).vm as unknown as ThresholdVm
        const before = settlement.thresholds.value.heavyPct
        vm.heavyPctInput = bad as number
        vm.applyThresholds()
        await flushPromises()
        expect(settlement.thresholds.value.heavyPct).toBe(before)
        expect(ElMessage.warning).toHaveBeenCalled()
        expect(ElMessage.success).not.toHaveBeenCalled()
        expect(JSON.stringify(Object.entries(localStorage))).not.toContain('"heavyPct":0')
    })

    it('合法值 20 → 套用為 0.2', async () => {
        const settlement = makeSettlement([rec()])
        const vm = mountReview(settlement).vm as unknown as ThresholdVm
        vm.heavyPctInput = 20
        vm.applyThresholds()
        expect(settlement.thresholds.value.heavyPct).toBe(0.2)
        expect(ElMessage.success).toHaveBeenCalled()
    })
})
