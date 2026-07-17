import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

// api wrapper mock 形狀照真實後端契約（OffboardingListResponse / OffboardingDetailResponse 節錄）；
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
    getOffboardingList: vi.fn(),
}))

import { getEmployees } from '@/api/employees'
import {
    getOffboardingDetail,
    getOffboardingList,
    patchNhiUnenroll,
    closeOffboarding,
} from '@/api/offboarding'
import OffboardingView from '../OffboardingView.vue'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'

const mockGetEmployees = getEmployees as unknown as ReturnType<typeof vi.fn>
const mockGetDetail = getOffboardingDetail as unknown as ReturnType<typeof vi.fn>
const mockGetList = getOffboardingList as unknown as ReturnType<typeof vi.fn>
const mockPatchNhi = patchNhiUnenroll as unknown as ReturnType<typeof vi.fn>
const mockClose = closeOffboarding as unknown as ReturnType<typeof vi.fn>

/** OffboardingListItem fixture（照 schema.d.ts 契約） */
function listItem(overrides: Record<string, unknown> = {}) {
    return {
        employee_id: 1,
        employee_name: '測試員工',
        resign_date: '2026-07-01',
        has_record: false,
        closed_at: null,
        nhi_unenroll_submitted_at: null,
        certificate_pdf_path: null,
        magic_link_active: false,
        ...overrides,
    }
}

function listResponse(items: Array<Record<string, unknown>>) {
    return { data: { items, total: items.length } }
}

/** OffboardingDetailResponse 節錄 fixture（drawer 用） */
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

describe('OffboardingView 清單（單一 list 請求）三態操作', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    it('三態按鈕依 checklist 狀態渲染正確文案：no_record／open／closed', async () => {
        mockGetList.mockResolvedValue(
            listResponse([
                listItem({ employee_id: 1, employee_name: '未建立紀錄員工', has_record: false }),
                listItem({ employee_id: 2, employee_name: '未結案員工', has_record: true, closed_at: null }),
                listItem({ employee_id: 3, employee_name: '已結案員工', has_record: true, closed_at: '2026-07-05T00:00:00' }),
            ]),
        )

        const w = mountView()
        await flushPromises()

        const buttons = w.findAll('.offboard-action-btn')
        expect(buttons).toHaveLength(3)
        expect(buttons[0].text()).toBe('辦理離職')
        expect(buttons[1].text()).toBe('繼續辦理')
        expect(buttons[2].text()).toBe('查看文件')
        // 只打一支 list，不再對每列打 detail（N+1 修復核心斷言）
        expect(mockGetList).toHaveBeenCalledTimes(1)
        expect(mockGetDetail).not.toHaveBeenCalled()
    })

    it('員工名為連結，導向該員工詳情頁 /employees/:id', async () => {
        mockGetList.mockResolvedValue(
            listResponse([listItem({ employee_id: 7, employee_name: '離職連結員工' })]),
        )

        const w = mountView()
        await flushPromises()

        const link = w.findComponent(RouterLinkStub)
        expect(link.exists()).toBe(true)
        expect(link.props('to')).toBe('/employees/7')
        expect(link.text()).toContain('離職連結員工')
    })

    it('no_record 列點擊「辦理離職」→ 開啟 OffboardingModal 並帶入 id/name/離職日', async () => {
        mockGetList.mockResolvedValue(
            listResponse([
                listItem({ employee_id: 1, employee_name: '未建立紀錄員工', resign_date: '2026-07-01' }),
            ]),
        )

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
        expect(modal.props('initialResignDate')).toBe('2026-07-01')
    })

    it('drawer 開啟時抓 detail；術語用「離職證明下載連結」且退保 switch 附人工記錄說明', async () => {
        mockGetList.mockResolvedValue(
            listResponse([listItem({ employee_id: 2, employee_name: '未結案員工', has_record: true })]),
        )
        mockGetDetail.mockResolvedValue({
            data: detailFixture({ employee_id: 2, closed_at: null }),
        })

        const w = mountView()
        await flushPromises()
        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        expect(mockGetDetail).toHaveBeenCalledWith(2)
        expect(w.text()).toContain('離職證明下載連結')
        expect(w.text()).not.toContain('Magic Link')
        expect(w.text()).toContain('仍需自行向健保署辦理')
    })

    it('drawer 切換 NHI 退保申報 → patch 後刷新 detail 與清單', async () => {
        mockGetList.mockResolvedValue(
            listResponse([listItem({ employee_id: 2, employee_name: '未結案員工', has_record: true })]),
        )
        mockGetDetail.mockResolvedValue({
            data: detailFixture({ employee_id: 2, closed_at: null, nhi_unenroll_submitted_at: null }),
        })
        mockPatchNhi.mockResolvedValue({ data: {} })

        const w = mountView()
        await flushPromises()
        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()

        const nhiSwitch = w.find('.nhi-unenroll-switch')
        expect(nhiSwitch.exists()).toBe(true)

        await nhiSwitch.trigger('click')
        await flushPromises()

        expect(mockPatchNhi).toHaveBeenCalledWith(2, { submitted: true })
        // drawer 開啟 1 次 + toggle 後刷新 1 次
        expect(mockGetDetail).toHaveBeenCalledTimes(2)
        // 初載 1 次 + toggle 後清單同步 1 次
        expect(mockGetList).toHaveBeenCalledTimes(2)
    })

    it('closed 列：NHI 退保開關 disabled，且已產生的離職證明可下載', async () => {
        mockGetList.mockResolvedValue(
            listResponse([
                listItem({
                    employee_id: 3,
                    employee_name: '已結案員工',
                    has_record: true,
                    closed_at: '2026-07-05T00:00:00',
                    certificate_pdf_path: '/tmp/cert-3.pdf',
                }),
            ]),
        )
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

    async function mountWithDrawer(detail: Record<string, unknown>) {
        mockGetList.mockResolvedValue(
            listResponse([listItem({ employee_id: 2, employee_name: '未結案員工', has_record: true })]),
        )
        mockGetDetail.mockResolvedValue({ data: detailFixture(detail) })
        const w = mountView()
        await flushPromises()
        await w.find('.offboard-action-btn').trigger('click')
        await flushPromises()
        return w
    }

    it('前置條件齊備 → 結案按鈕可按，確認後呼叫 closeOffboarding 並刷新', async () => {
        const { ElMessageBox } = await import('element-plus')
        const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')
        mockClose.mockResolvedValue({
            data: { employee_id: 2, closed_at: '2026-07-17T12:00:00', closed_by_user_id: 1 },
        })

        const w = await mountWithDrawer({
            employee_id: 2,
            closed_at: null,
            nhi_unenroll_submitted_at: '2026-07-01T10:00:00',
            certificate_pdf_path: '/tmp/cert-2.pdf',
        })

        const closeBtn = w.find('.close-offboarding-btn')
        expect(closeBtn.exists()).toBe(true)
        expect(closeBtn.attributes('disabled')).toBeUndefined()

        await closeBtn.trigger('click')
        await flushPromises()

        expect(confirmSpy).toHaveBeenCalled()
        expect(mockClose).toHaveBeenCalledWith(2)
        // drawer 開啟 1 次 + 結案後刷新 1 次
        expect(mockGetDetail).toHaveBeenCalledTimes(2)
        confirmSpy.mockRestore()
    })

    it('前置條件未滿足 → 結案按鈕 disabled，列出缺項說明', async () => {
        const w = await mountWithDrawer({
            employee_id: 2,
            closed_at: null,
            nhi_unenroll_submitted_at: null,
            certificate_pdf_path: null,
        })

        const closeBtn = w.find('.close-offboarding-btn')
        expect(closeBtn.exists()).toBe(true)
        expect(closeBtn.attributes('disabled')).toBeDefined()

        const hint = w.find('.close-prereq-hint')
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toContain('健保退保')
        expect(hint.text()).toContain('離職證明')
    })

    it('已結案 → 不顯示結案按鈕，顯示結案時間', async () => {
        const w = await mountWithDrawer({
            employee_id: 2,
            closed_at: '2026-07-05T09:30:00',
            nhi_unenroll_submitted_at: '2026-07-01T10:00:00',
            certificate_pdf_path: '/tmp/cert-2.pdf',
        })

        expect(w.find('.close-offboarding-btn').exists()).toBe(false)
        const closedInfo = w.find('.closed-at-info')
        expect(closedInfo.exists()).toBe(true)
        expect(closedInfo.text()).toContain('2026')
    })
})

describe('OffboardingView 清單載入失敗與搜尋/篩選', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    it('list 載入失敗 → 顯示錯誤態＋重新載入，不得顯示空清單引導', async () => {
        mockGetList.mockRejectedValue(new Error('Network Error'))

        const w = mountView()
        await flushPromises()

        expect(w.text()).toContain('離職清單載入失敗')
        expect(w.find('.reload-list-btn').exists()).toBe(true)
        expect(w.text()).not.toContain('目前沒有離職中的員工')
    })

    it('點「重新載入」成功 → 表格渲染', async () => {
        mockGetList
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockResolvedValueOnce(
                listResponse([listItem({ employee_id: 2, employee_name: '回來的員工', has_record: true })]),
            )

        const w = mountView()
        await flushPromises()

        await w.find('.reload-list-btn').trigger('click')
        await flushPromises()

        expect(mockGetList).toHaveBeenCalledTimes(2)
        expect(w.text()).toContain('回來的員工')
        expect(w.text()).not.toContain('離職清單載入失敗')
    })

    it('搜尋姓名（前端過濾）縮小顯示列', async () => {
        mockGetList.mockResolvedValue(
            listResponse([
                listItem({ employee_id: 1, employee_name: '王小明' }),
                listItem({ employee_id: 2, employee_name: '李大華', has_record: true }),
            ]),
        )

        const w = mountView()
        await flushPromises()
        expect(w.findAll('.offboard-action-btn')).toHaveLength(2)

        await w.find('.offboard-search input').setValue('王小')
        await flushPromises()

        expect(w.findAll('.offboard-action-btn')).toHaveLength(1)
        expect(w.text()).toContain('王小明')
        expect(w.text()).not.toContain('李大華')
    })

    it('狀態篩選（前端過濾）只留該狀態列', async () => {
        mockGetList.mockResolvedValue(
            listResponse([
                listItem({ employee_id: 1, employee_name: '無紀錄者', has_record: false }),
                listItem({ employee_id: 3, employee_name: '已結案者', has_record: true, closed_at: '2026-07-05T00:00:00' }),
            ]),
        )

        const w = mountView()
        await flushPromises()

        const statusSelect = w.findComponent({ name: 'ElSelect' })
        expect(statusSelect.exists()).toBe(true)
        statusSelect.vm.$emit('update:modelValue', 'closed')
        await flushPromises()

        expect(w.findAll('.offboard-action-btn')).toHaveLength(1)
        expect(w.text()).toContain('已結案者')
        expect(w.text()).not.toContain('無紀錄者')
    })
})

describe('OffboardingView 發起離職動線', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    it('頁頭「辦理離職」按鈕：懶載入職員工清單，選擇後開啟 OffboardingModal', async () => {
        mockGetList.mockResolvedValue(listResponse([]))
        mockGetEmployees.mockResolvedValue({
            data: [
                { id: 11, name: '在職甲', is_active: true },
                { id: 12, name: '在職乙', is_active: true },
                { id: 3, name: '已離職員工', is_active: false, resign_date: '2026-05-01' },
            ],
        })

        const w = mountView()
        await flushPromises()
        // 開頁不打員工清單（懶載，發起時才抓）
        expect(mockGetEmployees).not.toHaveBeenCalled()

        await w.find('.initiate-offboard-btn').trigger('click')
        await flushPromises()
        expect(mockGetEmployees).toHaveBeenCalledTimes(1)

        const select = w
            .findAllComponents({ name: 'ElSelect' })
            .find((c) => c.classes().includes('initiate-select'))
        expect(select).toBeTruthy()
        select!.vm.$emit('update:modelValue', 11)
        await flushPromises()

        await w.find('.initiate-confirm-btn').trigger('click')
        await flushPromises()

        const modal = w.findComponent(OffboardingModal)
        expect(modal.exists()).toBe(true)
        expect(modal.props('employeeId')).toBe(11)
        expect(modal.props('employeeName')).toBe('在職甲')
    })

    it('空清單顯示引導文案（含發起入口指引）', async () => {
        mockGetList.mockResolvedValue(listResponse([]))

        const w = mountView()
        await flushPromises()

        expect(w.text()).toContain('目前沒有離職中的員工')
        expect(w.text()).toContain('辦理離職')
    })
})
