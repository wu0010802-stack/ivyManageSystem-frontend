import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import GrowthContractView from '../GrowthContractView.vue'
import { formatCurrency } from '@/utils/currency'
import type { Schema } from '@/api/_generated/typed'

type GrowthHour = Schema<'GrowthHourOut'>
type GrowthPreviewGate = Schema<'GrowthPreviewGateOut'>
type GrowthPreviewRow = Schema<'GrowthPreviewRowOut'>
type GrowthPreviewOut = Schema<'GrowthPreviewOut'>

// ---- api/growthContract mocks ----
const listGrowthHoursMock = vi.fn()
const createGrowthHourMock = vi.fn()
const patchGrowthHourMock = vi.fn()
const deleteGrowthHourMock = vi.fn()
const patchSignedOnMock = vi.fn()
const getGrowthPreviewMock = vi.fn()
vi.mock('@/api/growthContract', () => ({
    listGrowthHours: (...a: unknown[]) => listGrowthHoursMock(...a),
    createGrowthHour: (...a: unknown[]) => createGrowthHourMock(...a),
    patchGrowthHour: (...a: unknown[]) => patchGrowthHourMock(...a),
    deleteGrowthHour: (...a: unknown[]) => deleteGrowthHourMock(...a),
    patchSignedOn: (...a: unknown[]) => patchSignedOnMock(...a),
    getGrowthPreview: (...a: unknown[]) => getGrowthPreviewMock(...a),
}))

// ---- auth mock ----
const hasPermissionMock = vi.fn()
vi.mock('@/utils/auth', () => ({ hasPermission: (...a: unknown[]) => hasPermissionMock(...a) }))

// ---- employee store mock ----
vi.mock('@/stores/employee', () => ({
    useEmployeeStore: () => ({
        employees: [
            { id: 2, name: '林慧慈' },
            { id: 3, name: '王雅玲' },
        ],
        fetchEmployees: vi.fn(),
    }),
}))

// ---- element-plus mock（ElMessage/ElMessageBox 可觀察，其餘走真元件）----
vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('element-plus')>()
    return {
        ...actual,
        ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
        ElMessageBox: { confirm: vi.fn() },
    }
})

// 系統時鐘固定在 2026-08-14（115 學年 8/1 剛換年）——currentSchoolYear() 依此推算預設學年。
const FIXED_NOW = new Date('2026-08-14T09:00:00+08:00')

const STUBS = {
    'el-select': true,
    'el-option': true,
    'el-input': true,
    'el-input-number': true,
    'el-form': true,
    'el-form-item': true,
    'el-checkbox': true,
    'el-date-picker': true,
    'el-tag': true,
    'el-icon': true,
    // 完整替換 el-table：把 :data 以 JSON 傾印成文字，可直接斷言內容有沒有到模板，
    // 不必依賴真的 ElTable/ElTableColumn scoped slot（同姊妹頁 RecruitmentBonusView 慣例）。
    'el-table': { props: ['data'], template: '<div class="table-stub">{{ JSON.stringify(data) }}</div>' },
    'el-dialog': {
        props: ['modelValue'],
        template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>',
    },
    'el-button': {
        props: ['disabled', 'loading'],
        template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    },
    // 保留 title/description 到文字，才能斷言 pending_rule 警示條內容。
    'el-alert': {
        props: ['title', 'description'],
        template: '<div class="alert-stub"><div class="alert-title">{{ title }}</div><div class="alert-desc">{{ description }}</div></div>',
    },
}

const mountView = () => mount(GrowthContractView, { global: { stubs: STUBS } })

const gate = (over: Partial<GrowthPreviewGate> = {}): GrowthPreviewGate => ({
    code: 'signed',
    status: 'pass',
    detail: '簽約日 2025-09-01',
    ...over,
})

const previewRow = (over: Partial<GrowthPreviewRow> = {}): GrowthPreviewRow => ({
    employee_id: 2,
    employee_name: '林慧慈',
    position_key: 'head_teacher_a',
    position_unknown: false,
    monthly_rate: 620,
    required_hours: 24,
    actual_hours: 24,
    hours_ratio: 1,
    tenure_months: 12,
    amount_if_eligible: 7440,
    eligible: true,
    amount: 7440,
    gates: [
        gate({ code: 'signed', status: 'pass', detail: '簽約日 2025-09-01' }),
        gate({ code: 'returning_rate', status: 'pass', detail: '全園舊生註冊率 85.0%（門檻 80%）' }),
        gate({ code: 'late_early', status: 'fail', detail: '遲到早退累計 250 分鐘（上限 200）' }),
        gate({ code: 'leave_days', status: 'no_data', detail: '查無假別統計資料' }),
    ],
    ...over,
})

const previewFixture = (over: Partial<GrowthPreviewOut> = {}): GrowthPreviewOut => ({
    school_year: 115,
    pending_rule: '金額語意暫依「每月提撥×在職月數」假設建模，待業主確認（spec §6 P2）',
    rows: [previewRow()],
    ...over,
})

const growthHour = (over: Partial<GrowthHour> = {}): GrowthHour => ({
    id: 1,
    employee_id: 2,
    employee_name: '林慧慈',
    school_year: 115,
    semester: 1,
    activity_date: '2026-09-01',
    hours: 3.5,
    title: '幼兒發展研習',
    note: null,
    created_by: 1,
    created_at: '2026-09-01T00:00:00',
    updated_at: '2026-09-01T00:00:00',
    ...over,
})

interface HourFormShape {
    id: number | null
    employee_id: number | null
    school_year: number
    semester: number
    activity_date: string
    hours: number
    title: string
    note: string
}

interface GateItem extends GrowthPreviewGate {
    symbol: string
    cls: string
    label: string
}
interface PreviewDisplayRow extends GrowthPreviewRow {
    amountLabel: string
    amountHintLabel: string
    gateItems: GateItem[]
}

interface ViewVm {
    schoolYear: number
    pendingRule: string
    hourRows: GrowthHour[]
    previewRows: GrowthPreviewRow[]
    previewTableData: PreviewDisplayRow[]
    onlyEligiblePayable: boolean
    hourDialogVisible: boolean
    hourForm: HourFormShape
    openHourDialog: (row?: GrowthHour) => void
    submitHour: () => Promise<void>
    confirmDeleteHour: (row: GrowthHour) => Promise<void>
    signedOnDialogVisible: boolean
    signedOnTarget: { employee_id: number; employee_name: string } | null
    signedOnDate: string | null
    openSignedOnDialog: (row: GrowthPreviewRow) => void
    saveSignedOn: () => Promise<void>
    clearSignedOn: () => Promise<void>
}

describe('GrowthContractView', () => {
    beforeEach(() => {
        vi.setSystemTime(FIXED_NOW)
        hasPermissionMock.mockReset().mockReturnValue(true)
        listGrowthHoursMock.mockReset().mockResolvedValue({ data: { items: [] } })
        createGrowthHourMock.mockReset()
        patchGrowthHourMock.mockReset()
        deleteGrowthHourMock.mockReset()
        patchSignedOnMock.mockReset()
        getGrowthPreviewMock.mockReset().mockResolvedValue({ data: previewFixture() })
        vi.mocked(ElMessage.success).mockReset()
        vi.mocked(ElMessage.error).mockReset()
        vi.mocked(ElMessage.warning).mockReset()
        vi.mocked(ElMessageBox.confirm).mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('預設學年為當前民國學年（2026-08-14 → 115 學年，8/1 已換年）', async () => {
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        expect(vm.schoolYear).toBe(115)
        expect(getGrowthPreviewMock).toHaveBeenCalledWith(115)
        expect(listGrowthHoursMock).toHaveBeenCalledWith(expect.objectContaining({ school_year: 115 }))
    })

    it('① 學年切換觸發時數與預覽重查', async () => {
        const wrapper = mountView()
        await flushPromises()
        listGrowthHoursMock.mockClear()
        getGrowthPreviewMock.mockClear()

        const vm = wrapper.vm as unknown as ViewVm
        vm.schoolYear = 114
        await flushPromises()

        expect(listGrowthHoursMock).toHaveBeenCalledWith(expect.objectContaining({ school_year: 114 }))
        expect(getGrowthPreviewMock).toHaveBeenCalledWith(114)
    })

    it('② 時數新增 dialog 送出後呼叫 createGrowthHour 並重新整理列表與預覽', async () => {
        createGrowthHourMock.mockResolvedValue({ data: growthHour() })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openHourDialog()
        vm.hourForm.employee_id = 2
        vm.hourForm.activity_date = '2026-09-01'
        vm.hourForm.hours = 3.5
        vm.hourForm.title = '幼兒發展研習'
        await vm.submitHour()
        await flushPromises()

        expect(createGrowthHourMock).toHaveBeenCalledWith({
            employee_id: 2,
            school_year: 115,
            semester: 1,
            activity_date: '2026-09-01',
            hours: 3.5,
            title: '幼兒發展研習',
            note: null,
        })
        expect(vm.hourDialogVisible).toBe(false)
        expect(ElMessage.success).toHaveBeenCalled()
        // mount 一次＋新增後重查一次
        expect(listGrowthHoursMock.mock.calls.length).toBeGreaterThanOrEqual(2)
        expect(getGrowthPreviewMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('新增時數欄位未填齊時不送出，顯示提醒', async () => {
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        vm.openHourDialog()
        // employee_id 未選
        await vm.submitHour()
        await flushPromises()
        expect(createGrowthHourMock).not.toHaveBeenCalled()
        expect(ElMessage.warning).toHaveBeenCalled()
    })

    it('編輯既有時數登記呼叫 patchGrowthHour（不含 employee_id，後端不允許改員工）', async () => {
        patchGrowthHourMock.mockResolvedValue({ data: growthHour({ hours: 4 }) })
        listGrowthHoursMock.mockResolvedValue({ data: { items: [growthHour()] } })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openHourDialog(vm.hourRows[0])
        vm.hourForm.hours = 4
        await vm.submitHour()
        await flushPromises()

        expect(patchGrowthHourMock).toHaveBeenCalledWith(1, {
            school_year: 115,
            semester: 1,
            activity_date: '2026-09-01',
            hours: 4,
            title: '幼兒發展研習',
            note: null,
        })
    })

    it('刪除時數登記需 ElMessageBox 二次確認才呼叫 deleteGrowthHour', async () => {
        listGrowthHoursMock.mockResolvedValue({ data: { items: [growthHour()] } })
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        deleteGrowthHourMock.mockResolvedValue({ data: { message: '已刪除時數紀錄' } })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        await vm.confirmDeleteHour(vm.hourRows[0])
        await flushPromises()

        expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
        expect(deleteGrowthHourMock).toHaveBeenCalledWith(1)
    })

    it('取消刪除確認 → 不呼叫 deleteGrowthHour', async () => {
        listGrowthHoursMock.mockResolvedValue({ data: { items: [growthHour()] } })
        vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        await vm.confirmDeleteHour(vm.hourRows[0])
        await flushPromises()

        expect(deleteGrowthHourMock).not.toHaveBeenCalled()
    })

    it('③ 預覽表格 gate 欄位三種狀態圖示（pass/fail/no_data）彼此可視覺分辨', async () => {
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        const gates = vm.previewTableData[0].gateItems
        const byCode = Object.fromEntries(gates.map((g) => [g.code, g])) as Record<string, GateItem>

        expect(byCode.signed.status).toBe('pass')
        expect(byCode.signed.symbol).toBe('✓')
        expect(byCode.signed.cls).toBe('gate-pass')

        expect(byCode.late_early.status).toBe('fail')
        expect(byCode.late_early.symbol).toBe('✗')
        expect(byCode.late_early.cls).toBe('gate-fail')

        expect(byCode.leave_days.status).toBe('no_data')
        expect(byCode.leave_days.symbol).toBe('⚠')
        expect(byCode.leave_days.cls).toBe('gate-nodata')

        // (a) no_data 與 fail 不可只靠顏色分辨——symbol／class 都必須三態互異
        const symbols = new Set(gates.map((g) => g.symbol))
        const classes = new Set(gates.map((g) => g.cls))
        expect(symbols.size).toBeGreaterThanOrEqual(3)
        expect(classes.size).toBeGreaterThanOrEqual(3)
        expect(byCode.late_early.cls).not.toBe(byCode.leave_days.cls)
        expect(byCode.late_early.symbol).not.toBe(byCode.leave_days.symbol)
    })

    it('④ pending_rule 警示條必須渲染（制度標記，不可省略）', async () => {
        getGrowthPreviewMock.mockResolvedValue({
            data: previewFixture({ pending_rule: '金額語意待業主確認的特殊標記文字P2' }),
        })
        const wrapper = mountView()
        await flushPromises()

        expect(wrapper.find('.pending-rule-alert').exists()).toBe(true)
        expect(wrapper.text()).toContain('金額語意待業主確認的特殊標記文字P2')
        expect(wrapper.text()).toMatch(/試算|未發放/)
    })

    it('(b) 金額欄額外標示「試算」，不符合資格時顯示假設金額提示', async () => {
        getGrowthPreviewMock.mockResolvedValue({
            data: previewFixture({
                rows: [
                    previewRow({ employee_id: 2, employee_name: '符合者', eligible: true, amount: 7440, amount_if_eligible: 7440 }),
                    previewRow({
                        employee_id: 3,
                        employee_name: '不符合者',
                        eligible: false,
                        amount: 0,
                        amount_if_eligible: 6200,
                        gates: [gate({ code: 'signed', status: 'fail', detail: '尚未簽署自主成長契約' })],
                    }),
                ],
            }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        expect(vm.previewTableData[0].amountLabel).toBe(formatCurrency(7440))
        expect(vm.previewTableData[1].amountLabel).toBe(formatCurrency(0))
        expect(vm.previewTableData[1].amountHintLabel).toContain(formatCurrency(6200))
        expect(wrapper.text()).toContain('試算')
    })

    it('(c) 預覽表預設排序：符合資格且金額較高者在前；篩選只顯示符合資格且金額>0', async () => {
        getGrowthPreviewMock.mockResolvedValue({
            data: previewFixture({
                rows: [
                    previewRow({ employee_id: 1, employee_name: 'A不符合', eligible: false, amount: 0 }),
                    previewRow({ employee_id: 2, employee_name: 'B符合低額', eligible: true, amount: 100 }),
                    previewRow({ employee_id: 3, employee_name: 'C符合高額', eligible: true, amount: 9000 }),
                ],
            }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        expect(vm.previewTableData.map((r) => r.employee_name)).toEqual(['C符合高額', 'B符合低額', 'A不符合'])

        vm.onlyEligiblePayable = true
        await flushPromises()
        expect(vm.previewTableData.map((r) => r.employee_name)).toEqual(['C符合高額', 'B符合低額'])
    })

    it('(d) 學年快速切換：較晚送出但先回來的新結果不被舊結果覆蓋（含 hours 與 preview 兩者）', async () => {
        let resolveOldPreview: (v: unknown) => void = () => {}
        let resolveNewPreview: (v: unknown) => void = () => {}
        getGrowthPreviewMock.mockImplementation((year: number) => {
            if (year === 115) return new Promise((resolve) => { resolveOldPreview = resolve })
            return new Promise((resolve) => { resolveNewPreview = resolve })
        })
        let resolveOldHours: (v: unknown) => void = () => {}
        let resolveNewHours: (v: unknown) => void = () => {}
        listGrowthHoursMock.mockImplementation((params: { school_year: number }) => {
            if (params.school_year === 115) return new Promise((resolve) => { resolveOldHours = resolve })
            return new Promise((resolve) => { resolveNewHours = resolve })
        })

        const wrapper = mountView()
        // 首次掛載的 115 請求先不 resolve，直接切學年（模擬使用者快速操作）
        const vm = wrapper.vm as unknown as ViewVm
        vm.schoolYear = 114
        await flushPromises()

        // 新請求（114）先回來
        resolveNewPreview({ data: previewFixture({ school_year: 114, rows: [previewRow({ employee_id: 9, employee_name: '新學年資料' })] }) })
        resolveNewHours({ data: { items: [growthHour({ id: 9, school_year: 114 })] } })
        await flushPromises()
        // 舊請求（115）較晚回來，不應覆蓋畫面
        resolveOldPreview({ data: previewFixture({ school_year: 115, rows: [previewRow({ employee_id: 1, employee_name: '舊學年資料' })] }) })
        resolveOldHours({ data: { items: [growthHour({ id: 1, school_year: 115 })] } })
        await flushPromises()

        expect(vm.previewRows.map((r) => r.employee_id)).toEqual([9])
        expect(vm.hourRows.map((r) => r.id)).toEqual([9])
    })

    it('簽約日維護：設定送出 { signed_on: 日期 }', async () => {
        patchSignedOnMock.mockResolvedValue({ data: { employee_id: 2, growth_contract_signed_on: '2026-09-01' } })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openSignedOnDialog(vm.previewRows[0])
        vm.signedOnDate = '2026-09-01'
        await vm.saveSignedOn()
        await flushPromises()

        expect(patchSignedOnMock).toHaveBeenCalledWith(2, { signed_on: '2026-09-01' })
        expect(vm.signedOnDialogVisible).toBe(false)
    })

    it('簽約日維護：從既有 gate 明細帶出目前簽約日', async () => {
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openSignedOnDialog(vm.previewRows[0])
        expect(vm.signedOnDate).toBe('2025-09-01')
    })

    it('簽約日維護：清空送出 { signed_on: null }，需二次確認', async () => {
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        patchSignedOnMock.mockResolvedValue({ data: { employee_id: 2, growth_contract_signed_on: null } })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openSignedOnDialog(vm.previewRows[0])
        await vm.clearSignedOn()
        await flushPromises()

        expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
        expect(patchSignedOnMock).toHaveBeenCalledWith(2, { signed_on: null })
    })

    it('取消清空簽約日確認 → 不呼叫 patchSignedOn', async () => {
        vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openSignedOnDialog(vm.previewRows[0])
        await vm.clearSignedOn()
        await flushPromises()

        expect(patchSignedOnMock).not.toHaveBeenCalled()
    })

    it('無 SALARY_WRITE 權限時看不到「新增時數」按鈕', async () => {
        hasPermissionMock.mockReturnValue(false)
        const wrapper = mountView()
        await flushPromises()

        const buttonTexts = wrapper.findAll('button').map((b) => b.text())
        expect(buttonTexts.some((t) => t.includes('新增時數'))).toBe(false)
    })
})
