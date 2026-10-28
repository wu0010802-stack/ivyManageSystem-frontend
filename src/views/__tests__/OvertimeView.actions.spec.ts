import { describe, it, expect, vi, beforeEach } from 'vitest'

// 分頁契約 mock helper（vi.hoisted：vi.mock factory 會被提升到檔頭）。
// 抄 src/api/_pagination.ts 的 PagedResult 形狀——三支列表 api 回的是它，
// 不是 AxiosResponse；mock 若還用 { data } 會靜默給出空清單（假綠）。
const paged = vi.hoisted(
  () =>
    <T,>(items: T[]) => ({
      items,
      total: items.length,
      page: 1,
      pageSize: 5000,
      hasMore: false,
    }),
)

import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

// getOvertimes 同時供主清單與 useFetchPending 使用；回一筆待審資料讓「待審核項目」卡也渲染
const fakeOvertime = {
  id: 1,
  employee_name: '測試員工',
  overtime_date: '2026-08-03',
  overtime_type: 'weekday',
  overtime_type_label: '平日加班',
  start_time: '18:00',
  end_time: '20:00',
  hours: 2,
  use_comp_leave: false,
  overtime_pay: 500,
  reason: '活動籌備',
  status: 'pending',
}
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn(() => Promise.resolve(paged([fakeOvertime]))),
  createOvertime: vi.fn(),
  updateOvertime: vi.fn(),
  approveOvertime: vi.fn(),
  batchApproveOvertimes: vi.fn(),
  getOvertimeImportTemplate: vi.fn(),
  importOvertimes: vi.fn(),
  suggestOvertimeType: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [], fetchPolicies: vi.fn(() => Promise.resolve()) }),
}))
const perms = vi.hoisted(() => new Set<string>())
vi.mock('@/utils/auth', () => ({ hasPermission: (p: string) => perms.has(p), getUserInfo: () => ({ role: 'admin' }) }))
const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: confirmMock, prompt: vi.fn() },
}))
// useApprovalOperation 內部會取 notification store（無 active pinia 會炸）
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({ fetchSummary: vi.fn() }),
}))

import OvertimeView from '@/views/OvertimeView.vue'
import { approveOvertime, createOvertime, suggestOvertimeType } from '@/api/overtimes'
import { ElMessage } from 'element-plus'
import { buildOvertimeApproveConfirm } from '@/utils/overtimeApproveConfirm'

const globalStubs = {
  stubs: {
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
    'el-card': { template: '<div><slot /></div>' },
    LoadingPanel: { template: '<div><slot /></div>' },
    PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

async function mountView() {
  const w = shallowMount(OvertimeView, { global: globalStubs })
  await flushPromises()
  await nextTick()
  return w
}

describe('buildOvertimeApproveConfirm', () => {
  it('計薪：寫出員工、日期、時數與加班費入薪', () => {
    expect(buildOvertimeApproveConfirm({ ...fakeOvertime, overtime_type_label: '平日' })).toBe(
      '核准 測試員工 2026-08-03 的平日加班 2h？核准後加班費 NT$500 會列入該月薪資。',
    )
    // 標籤已帶「加班」也不會疊字
    expect(buildOvertimeApproveConfirm(fakeOvertime)).toContain('的平日加班 2h')
  })
  it('補休：寫出給幾小時補休，不提加班費', () => {
    const msg = buildOvertimeApproveConfirm({ ...fakeOvertime, use_comp_leave: true })
    expect(msg).toContain('核准後會給 2h 補休')
    expect(msg).not.toContain('加班費')
  })
})

describe('OvertimeView 核准確認與權限', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    perms.clear()
    mockIsMobile.value = false
  })

  it('單筆核准先跳確認；取消就不送出', async () => {
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
    const w = await mountView()
    confirmMock.mockRejectedValueOnce('cancel')
    await (w.vm as unknown as { approveOvertime: (r: unknown, a: boolean) => Promise<void> }).approveOvertime(fakeOvertime, true)
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('測試員工'), '核准加班', expect.anything())
    expect(approveOvertime).not.toHaveBeenCalled()
  })

  it('確認後才送出核准', async () => {
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
    const w = await mountView()
    confirmMock.mockResolvedValueOnce('confirm')
    vi.mocked(approveOvertime).mockResolvedValueOnce({ data: {} } as never)
    await (w.vm as unknown as { approveOvertime: (r: unknown, a: boolean) => Promise<void> }).approveOvertime(fakeOvertime, true)
    expect(approveOvertime).toHaveBeenCalledWith(1, { approved: true })
  })

  it('只有讀取權限：不顯示新增、批次加班與匯入', async () => {
    perms.add('OVERTIME_READ')
    const w = await mountView()
    expect(w.findComponent({ name: 'AdminCreateButton' }).exists()).toBe(false)
    expect(w.html()).not.toContain('批次加班')
    expect(w.html()).not.toContain('匯入加班單')
  })

  it('有寫入權限：顯示新增加班', async () => {
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
    const w = await mountView()
    expect(w.findComponent({ name: 'AdminCreateButton' }).exists()).toBe(true)
  })
})

describe('OvertimeView 管理端表單：建議加班類型（後端 GET /overtimes/suggest-type）', () => {
  type FormVm = {
    form: { employee_id: number | null; overtime_date: string; overtime_type: string; hours: number }
    openCreate: () => void
    saveOvertime: () => Promise<void>
  }
  // FormDialog 被 shallowMount stub 掉，改以 render 預設 slot 的 stub 才看得到表單內提示
  const mountWithForm = async () => {
    const w = shallowMount(OvertimeView, {
      global: {
        stubs: {
          ...globalStubs.stubs,
          FormDialog: { template: '<div class="form-dialog"><slot /></div>' },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { template: '<div><slot /></div>' },
        },
      },
    })
    await flushPromises()
    return w
  }

  beforeEach(() => {
    vi.mocked(suggestOvertimeType).mockReset()
    vi.mocked(createOvertime).mockReset()
    vi.mocked(ElMessage.error).mockReset()
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
  })

  it('新增時選好員工與日期 → 自動帶入建議類型；改成不符 → 顯示提示', async () => {
    vi.mocked(suggestOvertimeType).mockResolvedValue({
      data: {
        date: '2026-10-31',
        day_kind: 'rest_day',
        suggested_type: 'weekend',
        allowed_types: ['weekend'],
        reason: '2026-10-31依行事曆為休息日',
      },
    } as never)
    const w = await mountWithForm()
    const vm = w.vm as unknown as FormVm
    vm.openCreate()
    await nextTick()
    vm.form.employee_id = 5
    vm.form.overtime_date = '2026-10-31'
    await flushPromises()
    expect(suggestOvertimeType).toHaveBeenCalledWith({ employee_id: 5, date: '2026-10-31' })
    expect(vm.form.overtime_type).toBe('weekend')
    expect(w.find('[data-test="ot-type-mismatch"]').exists()).toBe(false)

    vm.form.overtime_type = 'weekday'
    await nextTick()
    expect(w.find('[data-test="ot-type-mismatch"]').text()).toContain('依行事曆為休息日')
  })

  it('模稜兩可 → 不改類型、只顯示 reason', async () => {
    vi.mocked(suggestOvertimeType).mockResolvedValue({
      data: {
        date: '2026-11-01',
        day_kind: 'ambiguous',
        suggested_type: 'weekday',
        allowed_types: ['weekday', 'weekend'],
        reason: '2026-11-01為週末，但該員工當日有排班',
      },
    } as never)
    const w = await mountWithForm()
    const vm = w.vm as unknown as FormVm
    vm.openCreate()
    await nextTick()
    vm.form.overtime_type = 'weekend'
    vm.form.employee_id = 5
    vm.form.overtime_date = '2026-11-01'
    await flushPromises()
    expect(vm.form.overtime_type).toBe('weekend')
    expect(w.find('[data-test="ot-type-info"]').text()).toContain('該員工當日有排班')
  })

  it('後端對類型與日期不符回 400 → 顯示後端訊息', async () => {
    vi.mocked(suggestOvertimeType).mockRejectedValue(new Error('offline'))
    vi.mocked(createOvertime).mockRejectedValueOnce({
      response: { status: 400, data: { detail: '2026-10-31依行事曆為休息日，不可填 weekday，請改為 weekend' } },
    })
    const w = await mountWithForm()
    const vm = w.vm as unknown as FormVm
    vm.openCreate()
    vm.form.employee_id = 5
    vm.form.overtime_date = '2026-10-31'
    vm.form.overtime_type = 'weekday'
    await flushPromises()
    await vm.saveOvertime()
    expect(vi.mocked(ElMessage.error).mock.calls.some((c) => String(c[0]).includes('不可填 weekday'))).toBe(true)
  })
})

