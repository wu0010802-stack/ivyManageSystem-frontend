import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import RecruitmentBonusView from '../RecruitmentBonusView.vue'
import { formatCurrency } from '@/utils/currency'
import type { Schema } from '@/api/_generated/typed'

type CampaignRow = Schema<'CampaignOut'>
type CampaignDetail = Schema<'CampaignDetailOut'>
type AttributionRow = Schema<'AttributionOut'>
type EmployeeSummaryRow = Schema<'EmployeeSummaryOut'>
type ExtraBonusRow = Schema<'ExtraBonusOut'>

// ---- api/recruitmentBonus mocks ----
const listCampaignsMock = vi.fn()
const createCampaignMock = vi.fn()
const getCampaignMock = vi.fn()
const syncCandidatesMock = vi.fn()
const createAttributionMock = vi.fn()
const patchAttributionMock = vi.fn()
const settleCampaignMock = vi.fn()
const getCampaignReportMock = vi.fn()
const getTransferRosterMock = vi.fn()
const exportCampaignXlsxMock = vi.fn()
vi.mock('@/api/recruitmentBonus', () => ({
    listCampaigns: (...a: unknown[]) => listCampaignsMock(...a),
    createCampaign: (...a: unknown[]) => createCampaignMock(...a),
    getCampaign: (...a: unknown[]) => getCampaignMock(...a),
    syncCandidates: (...a: unknown[]) => syncCandidatesMock(...a),
    createAttribution: (...a: unknown[]) => createAttributionMock(...a),
    patchAttribution: (...a: unknown[]) => patchAttributionMock(...a),
    settleCampaign: (...a: unknown[]) => settleCampaignMock(...a),
    getCampaignReport: (...a: unknown[]) => getCampaignReportMock(...a),
    getTransferRoster: (...a: unknown[]) => getTransferRosterMock(...a),
    exportCampaignXlsx: (...a: unknown[]) => exportCampaignXlsxMock(...a),
}))

// ---- api/extraBonuses mock ----
const listExtraBonusesMock = vi.fn()
vi.mock('@/api/extraBonuses', () => ({
    listExtraBonuses: (...a: unknown[]) => listExtraBonusesMock(...a),
}))

// ---- auth mock ----
const hasPermissionMock = vi.fn()
const hasFullSalaryViewMock = vi.fn()
vi.mock('@/utils/auth', () => ({
    hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
    hasFullSalaryView: () => hasFullSalaryViewMock(),
}))

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

const STUBS = {
    // 三個 tab 元件行為由各自 spec 覆蓋（Task 9/10），這裡 stub 掉避免真 mount 打 API
    ReportStatementTab: true,
    BonusSlipsTab: true,
    TransferRosterTab: true,
    'el-tabs': { template: '<div class="tabs-stub"><slot /></div>' },
    'el-tab-pane': {
        props: ['label'],
        template: '<div class="tab-pane-stub" :data-label="label"><slot /></div>',
    },
    'el-select': true,
    'el-option': true,
    'el-input': true,
    'el-input-number': true,
    'el-form': true,
    'el-form-item': true,
    'el-pagination': true,
    'el-tag': true,
    'el-icon': true,
    'el-date-picker': true,
    // 完整替換 el-table：把 :data 以 JSON 傾印成文字，可直接斷言內容有沒有到模板，
    // 不必依賴真的 ElTable/ElTableColumn scoped slot（vitest.config.js 沒吃
    // unplugin-vue-components 的 ElementPlusResolver，未替換會整段不渲染）。
    'el-table': { props: ['data'], template: '<div class="table-stub">{{ JSON.stringify(data) }}</div>' },
    'el-dialog': {
        props: ['modelValue'],
        template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>',
    },
    'el-button': {
        props: ['disabled', 'loading'],
        template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    },
    'el-result': {
        props: ['title', 'subTitle'],
        template: '<div class="result-stub">{{ title }} {{ subTitle }}</div>',
    },
}

const mountView = () => mount(RecruitmentBonusView, { global: { stubs: STUBS } })

const campaignRow = (over: Partial<CampaignRow> = {}): CampaignRow => ({
    id: 1,
    name: '115上招生獎勵',
    start_date: '2026-03-16',
    end_date: '2026-09-15',
    status: 'open',
    tier_config: [],
    grade_multipliers: {},
    point_catalog: { self_report: { label: '自報生', points: 0.3 } },
    collector_share: 100,
    settled_at: null,
    settled_by: null,
    created_at: null,
    updated_at: null,
    pending_count: 0,
    confirmed_count: 0,
    ...over,
})

const attributionRow = (over: Partial<AttributionRow> = {}): AttributionRow => ({
    id: 1,
    campaign_id: 1,
    recruitment_visit_id: 10,
    child_name: '黃翊睿',
    visit_month: '115.04',
    visit_grade: '幼幼班',
    employee_id: 2,
    employee_name: '林慧慈',
    point_code: 'self_report',
    points: 0.3,
    grade_multiplier: 1.5,
    collector_employee_id: null,
    collector_name: null,
    status: 'pending',
    notes: null,
    created_at: null,
    updated_at: null,
    ...over,
})

const summaryRow = (over: Partial<EmployeeSummaryRow> = {}): EmployeeSummaryRow => ({
    employee_id: 2,
    employee_name: '林慧慈',
    resigned: false,
    counted_persons: 3,
    unit_price: 400,
    gross_amount: 600,
    share_in: 0,
    share_out: 0,
    total_amount: 600,
    ...over,
})

const detailFixture = (over: Partial<CampaignDetail> = {}): CampaignDetail => ({
    ...campaignRow(),
    attributions: [],
    employee_summary: [],
    ...over,
})

const extraBonusRow = (over: Partial<ExtraBonusRow> = {}): ExtraBonusRow => ({
    id: 1,
    employee_id: 2,
    employee_name: '林慧慈',
    category: 'recruitment',
    category_label: '招生獎金',
    amount: 600,
    counts_for_supplementary: true,
    created_at: null,
    paid_date: null,
    period_month: 3,
    period_year: 2026,
    remark: '115上招生獎勵：確認 3 人',
    ...over,
})

interface ViewVm {
    campaigns: CampaignRow[]
    detail: CampaignDetail | null
    selectedCampaignId: number | null
    openDetail: (row: CampaignRow) => Promise<void>
    backToList: () => void
    doSync: () => Promise<void>
    doSettle: () => Promise<void>
    onStatusChange: (row: AttributionRow, status: string) => void
    settleDisabled: boolean
    settleDisabledReason: string
    unassignedCount: number
    attrPage: number
    pagedAttributions: AttributionRow[]
    attributions: AttributionRow[]
    extraBonusItems: ExtraBonusRow[]
    createForm: { name: string; start_date: string; end_date: string }
    submitCreate: () => Promise<void>
    openCreateDialog: () => void
    createDialogVisible: boolean
}

describe('RecruitmentBonusView', () => {
    beforeEach(() => {
        hasPermissionMock.mockReset().mockReturnValue(true)
        hasFullSalaryViewMock.mockReset().mockReturnValue(true)
        listCampaignsMock.mockReset().mockResolvedValue({ data: { items: [] } })
        createCampaignMock.mockReset()
        getCampaignMock.mockReset()
        syncCandidatesMock.mockReset()
        createAttributionMock.mockReset()
        patchAttributionMock.mockReset()
        settleCampaignMock.mockReset()
        listExtraBonusesMock.mockReset().mockResolvedValue({ data: { items: [], total_amount: 0 } })
        vi.mocked(ElMessage.success).mockReset()
        vi.mocked(ElMessage.error).mockReset()
        vi.mocked(ElMessage.warning).mockReset()
        vi.mocked(ElMessageBox.confirm).mockReset()
    })

    it('非完整薪資角色不載入 campaign 或員工獎金資料', async () => {
        hasFullSalaryViewMock.mockReturnValue(false)

        const wrapper = mountView()
        await flushPromises()

        expect(wrapper.text()).toContain('無法檢視全員薪資資料')
        expect(listCampaignsMock).not.toHaveBeenCalled()
        expect(getCampaignMock).not.toHaveBeenCalled()
        expect(listExtraBonusesMock).not.toHaveBeenCalled()
    })

    it('① campaign 列表渲染：名稱／期間／狀態／pending／confirmed', async () => {
        listCampaignsMock.mockResolvedValue({
            data: { items: [campaignRow({ pending_count: 3, confirmed_count: 5 })] },
        })
        const wrapper = mountView()
        await flushPromises()
        const text = wrapper.text()
        expect(text).toContain('115上招生獎勵')
        expect(text).toContain('2026-03-16')
        expect(text).toContain('2026-09-15')
        expect(text).toContain('進行中')
        expect(text).toContain('3')
        expect(text).toContain('5')
    })

    it('明細頁有四個 tab（統計表/歸屬核對/獎金條/轉帳名冊），預設統計表', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({ data: detailFixture() })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm & { activeTab: string }
        await vm.openDetail(campaignRow())
        await flushPromises()

        const labels = wrapper
            .findAll('.tab-pane-stub')
            .map((p) => p.attributes('data-label'))
        expect(labels).toEqual(['統計表', '歸屬核對', '獎金條', '轉帳名冊'])
        expect(vm.activeTab).toBe('statement')
    })

    it('② 有 pending 列時結算鈕 disabled 並顯示原因', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ pending_count: 2, attributions: [attributionRow({ status: 'pending' })] }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        expect(vm.settleDisabled).toBe(true)
        expect(vm.settleDisabledReason).toContain('2')
        const settleBtn = wrapper.findAll('button').find((b) => b.text().includes('結算'))
        expect(settleBtn?.attributes('disabled')).toBeDefined()
        expect(wrapper.text()).toContain('2 筆候選待確認')
    })

    it('pending 清空時結算鈕可用', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ pending_count: 0, employee_summary: [summaryRow()] }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        expect(vm.settleDisabled).toBe(false)
        const settleBtn = wrapper.findAll('button').find((b) => b.text().includes('結算'))
        expect(settleBtn?.attributes('disabled')).toBeUndefined()
    })

    it('③ 每師彙總卡顯示金額與離職標記', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({
                pending_count: 0,
                employee_summary: [
                    summaryRow({ employee_name: '林慧慈', counted_persons: 3, unit_price: 400, total_amount: 600, resigned: false }),
                    summaryRow({ employee_id: 3, employee_name: '王雅玲', counted_persons: 15, unit_price: 2000, total_amount: 12720, resigned: true }),
                ],
            }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('林慧慈')
        expect(text).toContain(formatCurrency(600))
        expect(text).toContain('王雅玲')
        expect(text).toContain(formatCurrency(12720))
        expect(text).toContain('已離職')
    })

    it('④ 已結算時整頁唯讀：同步／新增歸屬列／結算按鈕都不出現，顯示唯讀提示', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow({ status: 'settled' })] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ status: 'settled', settled_at: '2026-04-01T00:00:00', pending_count: 0 }),
        })
        listExtraBonusesMock.mockResolvedValue({ data: { items: [extraBonusRow()], total_amount: 600 } })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow({ status: 'settled' }))
        await flushPromises()

        const buttonTexts = wrapper.findAll('button').map((b) => b.text())
        expect(buttonTexts.some((t) => t.includes('同步候選'))).toBe(false)
        expect(buttonTexts.some((t) => t.includes('新增歸屬列'))).toBe(false)
        expect(buttonTexts.some((t) => t.includes('結算'))).toBe(false)
        expect(wrapper.text()).toContain('已結算')
        expect(wrapper.text()).toContain('唯讀')
    })

    it('⑤ 無 SALARY_WRITE 時看不到任何寫入按鈕', async () => {
        hasPermissionMock.mockReturnValue(false)
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({ data: detailFixture({ pending_count: 0 }) })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        const buttonTexts = wrapper.findAll('button').map((b) => b.text())
        expect(buttonTexts.some((t) => t.includes('新增期間'))).toBe(false)
        expect(buttonTexts.some((t) => t.includes('同步候選'))).toBe(false)
        expect(buttonTexts.some((t) => t.includes('新增歸屬列'))).toBe(false)
        expect(buttonTexts.some((t) => t.includes('結算'))).toBe(false)
    })

    it('(c) 招生人未指定的列有警示計數，HR 一眼看出待指定筆數', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({
                pending_count: 2,
                attributions: [
                    attributionRow({ id: 1, employee_id: null, employee_name: null }),
                    attributionRow({ id: 2, employee_id: null, employee_name: null }),
                    attributionRow({ id: 3, employee_id: 2 }),
                ],
            }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        expect(vm.unassignedCount).toBe(2)
        expect(wrapper.text()).toContain('2 筆')
        expect(wrapper.text()).toMatch(/待指定|未指定/)
    })

    it('(a) 歸屬列超過分頁大小時分頁，不整批塞進 DOM', async () => {
        const rows = Array.from({ length: 45 }, (_, i) => attributionRow({ id: i + 1 }))
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({ data: detailFixture({ pending_count: 45, attributions: rows }) })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        expect(vm.attributions.length).toBe(45)
        expect(vm.pagedAttributions.length).toBe(20)
        vm.attrPage = 3
        await flushPromises()
        expect(vm.pagedAttributions.length).toBe(5)
    })

    it('(b) 結算前用 ElMessageBox.confirm 二次確認，文案含人數與金額且明講不可撤銷', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({
                pending_count: 0,
                employee_summary: [summaryRow({ total_amount: 600 }), summaryRow({ employee_id: 3, total_amount: 12720 })],
            }),
        })
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        settleCampaignMock.mockResolvedValue({
            data: { campaign_id: 1, settled_at: '2026-04-01T00:00:00', payments: [] },
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        await vm.doSettle()
        await flushPromises()

        expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
        const [message] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
        expect(String(message)).toContain('2')
        expect(String(message)).toContain(formatCurrency(13320))
        expect(String(message)).toContain('不可撤銷')
        expect(settleCampaignMock).toHaveBeenCalledWith(1)
    })

    it('使用者取消結算確認 → 不呼叫 settleCampaign', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ pending_count: 0, employee_summary: [summaryRow()] }),
        })
        vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        await vm.doSettle()
        await flushPromises()
        expect(settleCampaignMock).not.toHaveBeenCalled()
    })

    it('結算成功後顯示已發放明細（GET /extra-bonuses?category=recruitment）', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock
            .mockResolvedValueOnce({ data: detailFixture({ pending_count: 0, employee_summary: [summaryRow()] }) })
            .mockResolvedValueOnce({
                data: detailFixture({ status: 'settled', settled_at: '2026-04-01T00:00:00', pending_count: 0 }),
            })
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        settleCampaignMock.mockResolvedValue({
            data: { campaign_id: 1, settled_at: '2026-04-01T00:00:00', payments: [{ employee_id: 2, employee_name: '林慧慈', resigned: false, amount: 600 }] },
        })
        listExtraBonusesMock.mockResolvedValue({
            data: { items: [extraBonusRow()], total_amount: 600 },
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        await vm.doSettle()
        await flushPromises()

        expect(listExtraBonusesMock).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'recruitment', year: 2026, month: 4 }),
        )
        expect(wrapper.text()).toContain('林慧慈')
        expect(wrapper.text()).toContain(formatCurrency(600))
    })

    it('(d) 結算 409（dict 形狀 detail）顯示後端訊息，不是 [object Object]', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ pending_count: 0, employee_summary: [summaryRow()] }),
        })
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        settleCampaignMock.mockRejectedValue({
            response: {
                status: 409,
                data: {
                    detail: {
                        message: '有員工合計為負，須人工處理後才能結算',
                        negative_employees: [{ employee_id: 9, total_amount: -100 }],
                    },
                },
            },
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        await vm.doSettle()
        await flushPromises()

        expect(ElMessage.error).toHaveBeenCalledTimes(1)
        const [msg] = vi.mocked(ElMessage.error).mock.calls[0]
        expect(String(msg)).toContain('有員工合計為負，須人工處理後才能結算')
        expect(String(msg)).not.toContain('[object Object]')
    })

    it('(d) 結算 409（字串 detail：pending 未清）顯示後端訊息', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ pending_count: 0, employee_summary: [summaryRow()] }),
        })
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        settleCampaignMock.mockRejectedValue({
            response: {
                status: 409,
                data: { detail: '招生獎金期「115上招生獎勵」尚有 2 筆候選待確認（pending），請先於歸屬列表處理' },
            },
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        await vm.doSettle()
        await flushPromises()

        expect(ElMessage.error).toHaveBeenCalledTimes(1)
        const [msg] = vi.mocked(ElMessage.error).mock.calls[0]
        expect(String(msg)).toContain('尚有 2 筆候選待確認')
    })

    it('同步候選成功顯示四個計數', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({ data: detailFixture({ pending_count: 0 }) })
        syncCandidatesMock.mockResolvedValue({
            data: { created: 4, excluded: 1, skipped_other_campaign: 0, carried_over: 2, note: 'note' },
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        await vm.doSync()
        await flushPromises()

        expect(syncCandidatesMock).toHaveBeenCalledWith(1)
        expect(ElMessage.success).toHaveBeenCalled()
        const [msg] = vi.mocked(ElMessage.success).mock.calls[0]
        expect(String(msg)).toContain('4')
        expect(String(msg)).toContain('1')
        expect(String(msg)).toContain('2')
    })

    it('建立招生獎金期只送 name/start_date/end_date（參數用後端預設，不在 UI 暴露）', async () => {
        createCampaignMock.mockResolvedValue({ data: campaignRow() })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm

        vm.openCreateDialog()
        vm.createForm.name = '115下招生獎勵'
        vm.createForm.start_date = '2026-09-16'
        vm.createForm.end_date = '2027-03-15'
        await vm.submitCreate()
        await flushPromises()

        expect(createCampaignMock).toHaveBeenCalledWith({
            name: '115下招生獎勵',
            start_date: '2026-09-16',
            end_date: '2027-03-15',
        })
        expect(vm.createDialogVisible).toBe(false)
    })
})

describe('RecruitmentBonusView 幼生欄顯示', () => {
    beforeEach(() => {
        hasFullSalaryViewMock.mockReset().mockReturnValue(true)
        listCampaignsMock.mockReset()
        getCampaignMock.mockReset()
        listExtraBonusesMock.mockReset()
    })

    it('有幼生資料時顯示姓名與年級月份，不是訪視編號', async () => {
        // HR 靠這欄判斷「這個孩子是誰招來的」；退回顯示 #id 等同頁面不可用。
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({ attributions: [attributionRow()] }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('黃翊睿')
        expect(text).toContain('幼幼班')
        expect(text).toContain('115.04')
        expect(text).not.toContain('訪視 #10')
    })

    it('手動加列（無 visit）顯示「（手動加列）」', async () => {
        listCampaignsMock.mockResolvedValue({ data: { items: [campaignRow()] } })
        getCampaignMock.mockResolvedValue({
            data: detailFixture({
                attributions: [
                    attributionRow({
                        recruitment_visit_id: null,
                        child_name: null,
                        visit_month: null,
                        visit_grade: null,
                    }),
                ],
            }),
        })
        const wrapper = mountView()
        await flushPromises()
        const vm = wrapper.vm as unknown as ViewVm
        await vm.openDetail(campaignRow())
        await flushPromises()

        expect(wrapper.text()).toContain('（手動加列）')
    })
})
