import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

// api wrapper mock 形狀照真實後端契約（OffboardingDetailResponse / EmployeeOut 節錄欄位）；
// 全部具名匯出都要提供 vi.fn() stub，避免 MagicLinkPanel / OffboardingModal 內部 import 到 undefined。
vi.mock('@/api/employees', () => ({
    getEmployees: vi.fn(),
}))
vi.mock('@/api/offboarding', () => ({
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingDetail: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
    closeOffboarding: vi.fn(),
}))

import { getEmployees } from '@/api/employees'
import { getOffboardingDetail, patchNhiUnenroll, closeOffboarding } from '@/api/offboarding'
import OffboardingView from '../OffboardingView.vue'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'

const mockGetEmployees = getEmployees as unknown as ReturnType<typeof vi.fn>
const mockGetDetail = getOffboardingDetail as unknown as ReturnType<typeof vi.fn>
const mockPatchNhi = patchNhiUnenroll as unknown as ReturnType<typeof vi.fn>
const mockClose = closeOffboarding as unknown as ReturnType<typeof vi.fn>

/** 後端「查無離職紀錄」的 axios 錯誤形狀（GET /offboarding/{id} 回 404） */
function notFoundError() {
    return Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404, data: { detail: 'OFFBOARDING_RECORD_NOT_FOUND' } },
    })
}

/** OffboardingDetailResponse 節錄 fixture（欄位齊全，照 schema.d.ts） */
function detailFixture(overrides: Record<string, unknown> = {}) {
    return {
        appraisal_marked_at: null,
        certificate_generated_at: null,
        certificate_pdf_path: null,
        closed_at: null,
        employee_id: 1,
        employee_name: '測試員工',
        leave_balance_snapshot: null,
        leave_snapshot_at: null,
        magic_link_active: false,
        magic_link_download_count: 0,
        magic_link_expires_at: null,
        magic_link_last_used_at: null,
        nhi_unenroll_submitted_at: null,
        opened_at: '2026-07-01T00:00:00',
        opened_by_user_id: 1,
        resign_date: '2026-07-01',
        resign_reason: null,
        user_revoked_at: null,
        ...overrides,
    }
}

function mountView() {
    return mount(OffboardingView, {
        global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub } },
    })
}

describe('OffboardingView 離職清單三態操作', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    it('三態按鈕依 checklist 狀態渲染正確文案：no_record／open／closed', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [
                { id: 1, name: '未建立紀錄員工', resign_date: '2026-07-01' },
                { id: 2, name: '未結案員工', resign_date: '2026-06-01' },
                { id: 3, name: '已結案員工', resign_date: '2026-05-01' },
            ],
        })
        mockGetDetail.mockImplementation((id: number) => {
            if (id === 1) return Promise.reject(notFoundError())
            if (id === 2) return Promise.resolve({ data: detailFixture({ employee_id: 2, closed_at: null }) })
            return Promise.resolve({
                data: detailFixture({ employee_id: 3, closed_at: '2026-07-05T00:00:00' }),
            })
        })

        const w = mountView()
        await flushPromises()

        const buttons = w.findAll('.offboard-action-btn')
        expect(buttons).toHaveLength(3)
        expect(buttons[0].text()).toBe('開始離職檢核')
        expect(buttons[1].text()).toBe('繼續檢核')
        expect(buttons[2].text()).toBe('查看文件')
    })

    it('員工名為連結，導向該員工詳情頁 /employees/:id（與員工管理 tab 一致）', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 7, name: '離職連結員工', resign_date: '2026-07-01' }],
        })
        mockGetDetail.mockRejectedValue(notFoundError())

        const w = mountView()
        await flushPromises()

        const link = w.findComponent(RouterLinkStub)
        expect(link.exists()).toBe(true)
        expect(link.props('to')).toBe('/employees/7')
        expect(link.text()).toContain('離職連結員工')
    })

    it('no_record 列點擊「開始離職檢核」→ 開啟 OffboardingModal 並帶入該員工 id/name', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 1, name: '未建立紀錄員工', resign_date: '2026-07-01' }],
        })
        mockGetDetail.mockRejectedValue(notFoundError())

        const w = mountView()
        await flushPromises()

        expect(w.findComponent(OffboardingModal).exists()).toBe(false)

        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        const modal = w.findComponent(OffboardingModal)
        expect(modal.exists()).toBe(true)
        expect(modal.props('modelValue')).toBe(true)
        expect(modal.props('employeeId')).toBe(1)
        expect(modal.props('employeeName')).toBe('未建立紀錄員工')
    })

    it('drawer 術語：下載連結區用「離職證明下載連結」而非 Magic Link；退保 switch 附人工記錄說明', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 2, name: '未結案員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail.mockResolvedValue({
            data: detailFixture({ employee_id: 2, closed_at: null }),
        })

        const w = mountView()
        await flushPromises()
        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        expect(w.text()).toContain('離職證明下載連結')
        expect(w.text()).not.toContain('Magic Link')
        expect(w.text()).toContain('仍需自行向健保署辦理')
    })

    it('open 列開啟 drawer 後切換 NHI 退保申報 → 呼叫 patchNhiUnenroll 並刷新該列', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 2, name: '未結案員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail.mockResolvedValue({
            data: detailFixture({ employee_id: 2, closed_at: null, nhi_unenroll_submitted_at: null }),
        })
        mockPatchNhi.mockResolvedValue({ data: {} })

        const w = mountView()
        await flushPromises()

        // 「繼續檢核」開既有管理 drawer
        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        const nhiSwitch = w.find('.nhi-unenroll-switch')
        expect(nhiSwitch.exists()).toBe(true)

        await nhiSwitch.trigger('click')
        await flushPromises()

        expect(mockPatchNhi).toHaveBeenCalledWith(2, { submitted: true })
        // 初次載入 + toggle 後 refreshDetail 各打一次 getOffboardingDetail
        expect(mockGetDetail).toHaveBeenCalledTimes(2)
    })

    it('closed 列：NHI 退保開關 disabled，且已產生的離職證明可下載', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 3, name: '已結案員工', resign_date: '2026-05-01' }],
        })
        mockGetDetail.mockResolvedValue({
            data: detailFixture({
                employee_id: 3,
                closed_at: '2026-07-05T00:00:00',
                certificate_pdf_path: '/tmp/cert-3.pdf',
            }),
        })

        const w = mountView()
        await flushPromises()

        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        const nhiSwitch = w.findComponent({ name: 'ElSwitch' })
        expect(nhiSwitch.props('disabled')).toBe(true)

        expect(w.find('.drawer-download-cert-btn').exists()).toBe(true)
    })
})

describe('OffboardingView 檢核結案（手動結案鈕）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    async function openDrawer(w: ReturnType<typeof mountView>) {
        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()
    }

    it('前置條件齊備（退保已申報＋證明已產生）→ 結案按鈕可按，確認後呼叫 closeOffboarding 並刷新該列', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 2, name: '未結案員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail.mockResolvedValue({
            data: detailFixture({
                employee_id: 2,
                closed_at: null,
                nhi_unenroll_submitted_at: '2026-07-01T10:00:00',
                certificate_pdf_path: '/tmp/cert-2.pdf',
            }),
        })
        mockClose.mockResolvedValue({
            data: { employee_id: 2, closed_at: '2026-07-17T12:00:00', closed_by_user_id: 1 },
        })
        const { ElMessageBox } = await import('element-plus')
        const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')

        const w = mountView()
        await flushPromises()
        await openDrawer(w)

        const closeBtn = w.find('.close-offboarding-btn')
        expect(closeBtn.exists()).toBe(true)
        expect(closeBtn.attributes('disabled')).toBeUndefined()

        await closeBtn.trigger('click')
        await flushPromises()

        expect(confirmSpy).toHaveBeenCalled()
        expect(mockClose).toHaveBeenCalledWith(2)
        // 初次載入 + 結案後 refreshDetail 各一次
        expect(mockGetDetail).toHaveBeenCalledTimes(2)
        confirmSpy.mockRestore()
    })

    it('前置條件未滿足 → 結案按鈕 disabled，並列出缺項說明', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 2, name: '未結案員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail.mockResolvedValue({
            data: detailFixture({
                employee_id: 2,
                closed_at: null,
                nhi_unenroll_submitted_at: null,
                certificate_pdf_path: null,
            }),
        })

        const w = mountView()
        await flushPromises()
        await openDrawer(w)

        const closeBtn = w.find('.close-offboarding-btn')
        expect(closeBtn.exists()).toBe(true)
        expect(closeBtn.attributes('disabled')).toBeDefined()

        const hint = w.find('.close-prereq-hint')
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toContain('健保退保')
        expect(hint.text()).toContain('離職證明')
    })

    it('已結案 → 不顯示結案按鈕，顯示結案時間', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 3, name: '已結案員工', resign_date: '2026-05-01' }],
        })
        mockGetDetail.mockResolvedValue({
            data: detailFixture({
                employee_id: 3,
                closed_at: '2026-07-05T09:30:00',
                nhi_unenroll_submitted_at: '2026-07-01T10:00:00',
                certificate_pdf_path: '/tmp/cert-3.pdf',
            }),
        })

        const w = mountView()
        await flushPromises()
        await openDrawer(w)

        expect(w.find('.close-offboarding-btn').exists()).toBe(false)
        const closedInfo = w.find('.closed-at-info')
        expect(closedInfo.exists()).toBe(true)
        expect(closedInfo.text()).toContain('2026')
    })
})

describe('OffboardingView detail 載入失敗第四態（load_failed）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    it('非 404 的載入失敗 → 顯示「載入失敗」與「重試載入」，不得誤標為未建立紀錄', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 5, name: '網路抖動員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail.mockRejectedValue(new Error('Network Error'))

        const w = mountView()
        await flushPromises()

        expect(w.text()).toContain('載入失敗')
        expect(w.text()).not.toContain('未建立紀錄')
        expect(w.find('.offboard-action-btn').text()).toBe('重試載入')
    })

    it('點「重試載入」成功 → 該列更新為真實狀態（未結案）', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 5, name: '網路抖動員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockResolvedValueOnce({ data: detailFixture({ employee_id: 5, closed_at: null }) })

        const w = mountView()
        await flushPromises()

        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        expect(mockGetDetail).toHaveBeenCalledTimes(2)
        expect(w.find('.offboard-action-btn').text()).toBe('繼續檢核')
    })

    it('點「重試載入」後端回 404 → 該列轉為未建立紀錄', async () => {
        mockGetEmployees.mockResolvedValue({
            data: [{ id: 5, name: '網路抖動員工', resign_date: '2026-06-01' }],
        })
        mockGetDetail
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockRejectedValueOnce(notFoundError())

        const w = mountView()
        await flushPromises()

        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        expect(w.find('.offboard-action-btn').text()).toBe('開始離職檢核')
        expect(w.text()).toContain('未建立紀錄')
    })
})
