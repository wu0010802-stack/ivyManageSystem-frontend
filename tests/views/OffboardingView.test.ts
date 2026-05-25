/**
 * tests/views/OffboardingView.test.ts
 *
 * 驗證：OffboardingView 只列出有 resign_date 的員工
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OffboardingView from '@/views/admin/OffboardingView.vue'

// ── Stubs ────────────────────────────────────────────────

const ElTableStub = {
    name: 'ElTable',
    props: ['data', 'border', 'stripe', 'emptyText'],
    template: '<div class="el-table-stub" />',
}

const ElTableColumnStub = {
    name: 'ElTableColumn',
    template: '<div><slot /></div>',
}

const ElTagStub = {
    name: 'ElTag',
    props: ['type'],
    template: '<span class="el-tag">{{ $slots.default?.() }}</span>',
}

const ElButtonStub = {
    name: 'ElButton',
    template: '<button><slot /></button>',
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
    getOffboardingDetail: vi.fn(),
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
}))

import * as employeesApi from '@/api/employees'
import * as offboardingApi from '@/api/offboarding'

// ── 測試資料 ──────────────────────────────────────────────

const activeEmployee = { id: 1, name: '在職員工', resign_date: null, is_active: true }
const resignedEmployee1 = { id: 2, name: '離職員工A', resign_date: '2026-03-01', is_active: false }
const resignedEmployee2 = { id: 3, name: '離職員工B', resign_date: '2026-04-15', is_active: false }

const mockDetail = {
    employee_id: 2,
    employee_name: '離職員工A',
    resign_date: '2026-03-01',
    resign_reason: null,
    opened_at: '2026-02-01T00:00:00',
    opened_by_user_id: 1,
    closed_at: null,
    certificate_pdf_path: null,
    certificate_generated_at: null,
    magic_link_active: false,
    magic_link_download_count: 0,
    magic_link_expires_at: null,
    magic_link_last_used_at: null,
    leave_balance_snapshot: null,
    leave_snapshot_at: null,
    nhi_unenroll_submitted_at: null,
    appraisal_marked_at: null,
    user_revoked_at: null,
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
                ElTag: ElTagStub,
                ElButton: ElButtonStub,
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

    it('只顯示有 resign_date 的員工，不顯示在職員工', async () => {
        // 回傳 3 筆：1 在職、2 離職
        vi.mocked(employeesApi.getEmployees).mockResolvedValue({
            data: [activeEmployee, resignedEmployee1, resignedEmployee2],
        } as never)

        // fetchDetail 針對離職員工回傳 detail（在職員工不會被呼叫）
        vi.mocked(offboardingApi.getOffboardingDetail).mockImplementation((id: number) => {
            if (id === resignedEmployee1.id) {
                return Promise.resolve({ data: mockDetail }) as never
            }
            return Promise.resolve({ data: { ...mockDetail, employee_id: id } }) as never
        })

        const wrapper = mountView()

        // 等 onMounted 完成
        await new Promise((resolve) => setTimeout(resolve, 0))
        await wrapper.vm.$nextTick()

        // table data 應為 2 筆（只含離職員工），不含在職員工
        const tableStub = wrapper.findComponent(ElTableStub)
        const tableData = tableStub.props('data') as Array<{ employee: typeof activeEmployee }>

        expect(tableData).toHaveLength(2)

        const names = tableData.map((r) => r.employee.name)
        expect(names).toContain('離職員工A')
        expect(names).toContain('離職員工B')
        expect(names).not.toContain('在職員工')
    })
})
