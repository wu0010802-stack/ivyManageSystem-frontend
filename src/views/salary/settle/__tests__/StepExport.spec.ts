import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive } from 'vue'
import StepExport from '../StepExport.vue'
import type { SettlementRecord } from '@/composables/useSalarySettlement'

const downloadFileMock = vi.fn()
const downloadFileWithHeadersMock = vi.fn()
vi.mock('@/utils/download', () => ({
    downloadFile: (...a: unknown[]) => downloadFileMock(...a),
    downloadFileWithHeaders: (...a: unknown[]) => downloadFileWithHeadersMock(...a),
}))
const messageWarningMock = vi.fn()
vi.mock('element-plus', async (importOriginal) => ({
    ...(await importOriginal<typeof import('element-plus')>()),
    ElMessage: { warning: (...a: unknown[]) => messageWarningMock(...a) },
}))
const hasFullSalaryViewMock = vi.fn()
vi.mock('@/utils/auth', () => ({
    hasPermission: vi.fn().mockReturnValue(true),
    hasFullSalaryView: () => hasFullSalaryViewMock(),
}))

const rec = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    employee_id: 'E1',
    employee_name: '測試',
    version: 1,
    gross_salary: 40000,
    net_salary: 36000,
    is_finalized: true,
    breakdown_stale: false,
    manual_overrides: [],
    ...over,
})

const makeSettlement = (records: SettlementRecord[]) => {
    const recordsRef = ref(records)
    return {
        records: recordsRef,
        status: computed(() =>
            recordsRef.value.length > 0 && recordsRef.value.every((r) => r.is_finalized)
                ? ('finalized' as const)
                : ('reviewing' as const),
        ),
        finalizedCount: computed(() => recordsRef.value.filter((r) => r.is_finalized).length),
    }
}

const STUBS = {
    'el-alert': { template: '<div class="alert-stub">{{ $attrs.title }}</div>' },
    'el-card': { template: '<div><slot /></div>' },
    'el-result': { template: '<div class="result-stub">{{ $attrs.title }}<slot name="extra" /></div>' },
    'el-button': {
        props: ['disabled', 'loading'],
        template: '<button :disabled="disabled"><slot /></button>',
    },
    SalarySnapshotDialog: true,
}

const mountStep = (
    settlement: ReturnType<typeof makeSettlement>,
    query = reactive({ year: 2026, month: 5 }),
) =>
    mount(StepExport, {
        global: {
            stubs: STUBS,
            provide: { settlement, settleQuery: query },
            mocks: { $router: { push: vi.fn() } },
        },
    })

describe('StepExport', () => {
    beforeEach(() => {
        downloadFileMock.mockReset()
        downloadFileWithHeadersMock.mockReset()
        messageWarningMock.mockReset()
        hasFullSalaryViewMock.mockReset().mockReturnValue(true)
    })

    it('非完整薪資角色即使持有薪資權限，也不可操作全員名冊或總表匯出', async () => {
        hasFullSalaryViewMock.mockReturnValue(false)
        const wrapper = mountStep(makeSettlement([rec()]))
        const exportButtons = wrapper.findAll('button').filter((button) =>
            button.text().includes('名冊') || button.text().includes('Excel') || button.text().includes('PDF'),
        )

        expect(exportButtons).toHaveLength(7)
        expect(exportButtons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
        await exportButtons[0].trigger('click')
        expect(downloadFileMock).not.toHaveBeenCalled()
    })

    it('未全封存 → 顯示僅含已封存警示', () => {
        const wrapper = mountStep(makeSettlement([rec(), rec({ employee_id: 'E2', is_finalized: false })]))
        expect(wrapper.text()).toContain('尚有 1 筆未封存')
    })

    it('匯出轉帳名冊成功 → downloadFileWithHeaders 帶 type 與檔名；匯出後顯示完成卡', async () => {
        downloadFileWithHeadersMock.mockResolvedValueOnce({})
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('節慶獎金名冊'))
        await btn!.trigger('click')
        await flushPromises()
        expect(downloadFileWithHeadersMock).toHaveBeenCalledWith(
            '/salaries/2026/5/transfer-roster?type=festival',
            '2026年05月_節慶獎金轉帳名冊.xlsx',
        )
        expect(wrapper.text()).toContain('本月結薪完成')
    })

    it('匯出轉帳名冊失敗（downloadFileWithHeaders 回 null）→ 不顯示完成卡（避免誤判結薪完成）', async () => {
        downloadFileWithHeadersMock.mockResolvedValueOnce(null)
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('節慶獎金名冊'))
        await btn!.trigger('click')
        await flushPromises()
        expect(wrapper.text()).not.toContain('本月結薪完成')
    })

    it('切換月份後不沿用前一月份的匯出完成狀態', async () => {
        downloadFileWithHeadersMock.mockResolvedValueOnce({})
        const query = reactive({ year: 2026, month: 5 })
        const wrapper = mountStep(makeSettlement([rec()]), query)
        const btn = wrapper.findAll('button').find((b) => b.text().includes('節慶獎金名冊'))!
        await btn.trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('本月結薪完成')

        query.month = 6
        await flushPromises()

        expect(wrapper.text()).not.toContain('本月結薪完成')
    })

    it('重型匯出進行中再點不重送（await + loading 守衛，薪資全員匯出慢易誤點重複）', async () => {
        let resolve!: () => void
        downloadFileMock.mockReturnValueOnce(new Promise<void>((r) => { resolve = r }))
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('Excel'))!
        await btn.trigger('click')
        await btn.trigger('click') // 進行中第二次點擊
        expect(downloadFileMock).toHaveBeenCalledTimes(1)
        resolve()
        await flushPromises()
        // 結束後可再次匯出
        await btn.trigger('click')
        expect(downloadFileMock).toHaveBeenCalledTimes(2)
    })

    it('領現名冊（2026-10-22 義華 #52）：type=cash、檔名為領現名冊而非轉帳名冊', async () => {
        downloadFileWithHeadersMock.mockResolvedValueOnce({})
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('領現名冊'))
        expect(btn).toBeTruthy()
        await btn!.trigger('click')
        await flushPromises()
        expect(downloadFileWithHeadersMock).toHaveBeenCalledWith(
            '/salaries/2026/5/transfer-roster?type=cash',
            '2026年05月_領現名冊.xlsx',
        )
    })

    it('名冊 header X-Roster-Excluded-Count > 0 → 警示有 N 人未列入名冊', async () => {
        downloadFileWithHeadersMock.mockResolvedValueOnce({ 'x-roster-excluded-count': '2' })
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('薪資本薪名冊'))
        await btn!.trigger('click')
        await flushPromises()
        expect(messageWarningMock).toHaveBeenCalledTimes(1)
        expect(messageWarningMock.mock.calls[0][0]).toContain('有 2 人未列入名冊')
        expect(messageWarningMock.mock.calls[0][0]).toContain('領現名冊')
    })

    it('名冊 header 為 0 或缺 → 不警示', async () => {
        downloadFileWithHeadersMock.mockResolvedValueOnce({ 'x-roster-excluded-count': '0' })
        downloadFileWithHeadersMock.mockResolvedValueOnce({})
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('薪資本薪名冊'))!
        await btn.trigger('click')
        await flushPromises()
        await btn.trigger('click')
        await flushPromises()
        expect(downloadFileWithHeadersMock).toHaveBeenCalledTimes(2)
        expect(messageWarningMock).not.toHaveBeenCalled()
    })

    it('提示被排除者會列在「未列入名冊」工作表', () => {
        const wrapper = mountStep(makeSettlement([rec()]))
        expect(wrapper.text()).toContain('未列入名冊')
    })

    it('匯出總表 Excel/PDF', async () => {
        const wrapper = mountStep(makeSettlement([rec()]))
        await wrapper.findAll('button').find((b) => b.text().includes('Excel'))!.trigger('click')
        await wrapper.findAll('button').find((b) => b.text().includes('PDF'))!.trigger('click')
        expect(downloadFileMock).toHaveBeenCalledWith(
            '/salaries/export-all?year=2026&month=5&format=xlsx',
            '2026年5月薪資總表.xlsx',
        )
        expect(downloadFileMock).toHaveBeenCalledWith(
            '/salaries/export-all?year=2026&month=5&format=pdf',
            '2026年5月薪資總表.pdf',
        )
    })
})
