/**
 * 「職務代理人」下拉永遠空白（bug-hunt 2026-07-27）。
 *
 * PortalLeaveView 透過 useEmployeeStore → GET /api/employees 取清單，但那是管理端端點
 * （require_staff_permission(EMPLOYEES_READ)），教師一定 403；實測連 principal /
 * supervisor 也沒有該權限，只有 admin 看得到選項。錯誤又被 _createFetchStore 吞進
 * error 而不 toast，畫面沒有任何提示，老師會以為園所沒建員工資料。
 *
 * 後果：送假單時無法指定代理人，代理流程只剩「被別人指定後回應」的那一半。
 *
 * 改走教師端專用的 GET /portal/colleagues（條件與送單時的 _validate_substitute 一致）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// vi.mock 會被提升到檔案頂端，一般 const 在 factory 執行時尚未初始化
const { COLLEAGUES, fetchEmployees } = vi.hoisted(() => ({
  COLLEAGUES: [{ id: 2, name: '在職同事', employee_id: 'T002' }],
  fetchEmployees: vi.fn(),
}))

vi.mock('@/api/portal', () => ({
  getMyColleagues: vi.fn().mockResolvedValue({ data: COLLEAGUES }),
  getMyLeaveStats: vi.fn().mockResolvedValue({ data: {} }),
  getMySubstituteRequests: vi.fn().mockResolvedValue({ data: [] }),
  respondToSubstitute: vi.fn(),
  createMyLeave: vi.fn(),
  uploadMyLeaveAttachments: vi.fn(),
  getMyQuotas: vi.fn().mockResolvedValue({ data: [] }),
  getMyWorkdayHours: vi.fn().mockResolvedValue({ data: { workday_hours: 8 } }),
  getMyLeaves: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))

vi.mock('@/api/portalLeaveQuotaExpiry', () => ({
  getMyLeaveQuotaExpiry: vi.fn().mockResolvedValue({ data: {} }),
  getMyCompLeaveGrants: vi.fn(),
  getMyPayoutHistory: vi.fn(),
}))

// 管理端員工端點：教師呼叫必 403，因此這支「不該被呼叫」正是本測試的重點
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees }),
}))

import { getMyColleagues } from '@/api/portal'
import PortalLeaveView from '@/views/portal/PortalLeaveView.vue'

async function mountView() {
  setActivePinia(createPinia())
  const wrapper = mount(PortalLeaveView, {
    global: {
      plugins: [ElementPlus],
      // 本檔只驗「代理人清單來自哪支 API」，子元件一律 stub，
      // 避免它們對 mock 資料形狀的期待干擾測試
      stubs: {
        teleport: true,
        PortalLeaveForm: true,
        PortalLeaveList: true,
        PortalSubstituteCardList: true,
        TeacherBottomSheet: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('教師端請假頁的代理人清單', () => {
  beforeEach(() => {
    vi.mocked(getMyColleagues).mockClear()
    fetchEmployees.mockClear()
  })

  it('改走教師端 /portal/colleagues，不得再打管理端員工端點', async () => {
    await mountView()

    expect(getMyColleagues).toHaveBeenCalledTimes(1)
    expect(fetchEmployees).not.toHaveBeenCalled()
  })

  it('取回的同事會餵給表單的代理人下拉', async () => {
    const wrapper = await mountView()

    expect(
      (wrapper.vm as unknown as { allEmployees: unknown[] }).allEmployees,
    ).toEqual(COLLEAGUES)
  })
})
