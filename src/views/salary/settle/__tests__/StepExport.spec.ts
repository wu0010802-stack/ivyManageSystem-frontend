import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import StepExport from '../StepExport.vue'
import type { SettlementRecord } from '@/composables/useSalarySettlement'

const downloadFileMock = vi.fn()
vi.mock('@/utils/download', () => ({ downloadFile: (...a: unknown[]) => downloadFileMock(...a) }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))

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
    'el-button': { template: '<button><slot /></button>' },
    SalarySnapshotDialog: true,
}

const mountStep = (settlement: ReturnType<typeof makeSettlement>) =>
    mount(StepExport, {
        global: {
            stubs: STUBS,
            provide: { settlement, settleQuery: { year: 2026, month: 5 } },
            mocks: { $router: { push: vi.fn() } },
        },
    })

describe('StepExport', () => {
    beforeEach(() => downloadFileMock.mockReset())

    it('未全封存 → 顯示僅含已封存警示', () => {
        const wrapper = mountStep(makeSettlement([rec(), rec({ employee_id: 'E2', is_finalized: false })]))
        expect(wrapper.text()).toContain('尚有 1 筆未封存')
    })

    it('匯出轉帳名冊成功 → downloadFile 帶 type 與檔名；匯出後顯示完成卡', async () => {
        downloadFileMock.mockResolvedValueOnce(true)
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('節慶獎金名冊'))
        await btn!.trigger('click')
        await flushPromises()
        expect(downloadFileMock).toHaveBeenCalledWith(
            '/salaries/2026/5/transfer-roster?type=festival',
            '2026年05月_節慶獎金轉帳名冊.xlsx',
        )
        expect(wrapper.text()).toContain('本月結薪完成')
    })

    it('匯出轉帳名冊失敗（downloadFile 回 false）→ 不顯示完成卡（避免誤判結薪完成）', async () => {
        downloadFileMock.mockResolvedValueOnce(false)
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('節慶獎金名冊'))
        await btn!.trigger('click')
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
