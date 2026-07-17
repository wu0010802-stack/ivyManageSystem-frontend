/**
 * tests/views/OffboardingView.test.ts
 *
 * 驗證：OffboardingView 表格資料來自單一 GET /offboarding/ list 端點。
 * 「只列已設離職日員工」的過濾職責已移至後端（tests/test_offboarding_api_list.py），
 * 前端不再抓全員工過濾；掛載時也不得打 getEmployees（發起選擇器為懶載）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OffboardingView from '@/views/admin/OffboardingView.vue'

// ── Stubs ────────────────────────────────────────────────

const ElTableStub = {
    name: 'ElTable',
    props: ['data', 'border', 'stripe'],
    template: '<div class="el-table-stub" />',
}

const ElTableColumnStub = {
    name: 'ElTableColumn',
    template: '<div><slot /></div>',
}

const ElDrawerStub = {
    name: 'ElDrawer',
    props: ['modelValue'],
    template: '<div v-if="modelValue"><slot /></div>',
}

const MagicLinkPanelStub = {
    name: 'MagicLinkPanel',
    template: '<div class="magic-link-panel-stub" />',
}

// ── Mocks ─────────────────────────────────────────────────

vi.mock('@/api/employees', () => ({
    getEmployees: vi.fn(),
}))

vi.mock('@/api/offboarding', () => ({
    getOffboardingList: vi.fn(),
    getOffboardingDetail: vi.fn(),
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
    closeOffboarding: vi.fn(),
}))

import * as employeesApi from '@/api/employees'
import * as offboardingApi from '@/api/offboarding'

// ── 測試資料（OffboardingListItem 形狀照 schema.d.ts 契約）──

const listItemA = {
    employee_id: 2,
    employee_name: '離職員工A',
    resign_date: '2026-03-01',
    has_record: true,
    closed_at: null,
    nhi_unenroll_submitted_at: null,
    certificate_pdf_path: null,
    magic_link_active: false,
}

const listItemB = {
    ...listItemA,
    employee_id: 3,
    employee_name: '離職員工B',
    resign_date: '2026-04-15',
    has_record: false,
}

// ── Mount Helper ──────────────────────────────────────────

function mountView() {
    return mount(OffboardingView, {
        global: {
            plugins: [createPinia()],
            directives: {
                loading: { mounted() {}, updated() {} },
            },
            stubs: {
                ElTable: ElTableStub,
                ElTableColumn: ElTableColumnStub,
                ElDrawer: ElDrawerStub,
                MagicLinkPanel: MagicLinkPanelStub,
                ElMessage: true,
            },
        },
    })
}

// ── Tests ─────────────────────────────────────────────────

describe('OffboardingView', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
    })

    it('表格資料來自單一 list 請求；掛載不打 getEmployees、不逐列打 detail', async () => {
        vi.mocked(offboardingApi.getOffboardingList).mockResolvedValue({
            data: { items: [listItemA, listItemB], total: 2 },
        } as never)

        const wrapper = mountView()

        // 等 onMounted 完成
        await new Promise((resolve) => setTimeout(resolve, 0))
        await wrapper.vm.$nextTick()

        const tableStub = wrapper.findComponent(ElTableStub)
        const tableData = tableStub.props('data') as Array<{ employee_name: string }>

        expect(tableData).toHaveLength(2)
        expect(tableData.map((r) => r.employee_name)).toEqual(['離職員工A', '離職員工B'])

        expect(offboardingApi.getOffboardingList).toHaveBeenCalledTimes(1)
        expect(employeesApi.getEmployees).not.toHaveBeenCalled()
        expect(offboardingApi.getOffboardingDetail).not.toHaveBeenCalled()
    })
})
