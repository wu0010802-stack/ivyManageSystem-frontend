import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'

/**
 * PortalLeaveView（教師請假）smoke 測試（2026-08-24 補零覆蓋）。
 *
 * 鎖住教師每天走的路徑：特休統計卡、待回應代理請求（alert + 接受/拒絕）、
 * 新增請假表單開啟。API mock 形狀抄自後端實際契約
 * （/portal/my-leave-stats、/portal/my-substitute-requests）。
 */

const { mockColleagues, mockStats, mockSubstitutes, mockRespond } = vi.hoisted(() => ({
  mockColleagues: vi.fn(),
  mockStats: vi.fn(),
  mockSubstitutes: vi.fn(),
  mockRespond: vi.fn(),
}))

vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    getMyColleagues: mockColleagues,
    getMyLeaveStats: mockStats,
    getMySubstituteRequests: mockSubstitutes,
    respondToSubstitute: mockRespond,
  }
})

vi.mock('element-plus', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

// 走 mobile 分支：桌面 el-table 在 happy-dom 不渲染資料列、el-dialog teleport
// 時序難斷言；mobile 用真 PortalSubstituteCardList + 可渲染 slot 的
// TeacherBottomSheet stub，互動測試更貼近教師實際使用情境（手機為主）。
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: true }, cleanup: () => {} }),
}))

import PortalLeaveView from '@/views/portal/PortalLeaveView.vue'

const STATS = {
  hire_date: '2020-08-01',
  seniority_years: 6,
  seniority_months: 0,
  annual_leave_quota: 15,
  annual_leave_used_days: 4,
}

const PENDING_SUBSTITUTE = {
  id: 7,
  requester_name: '王老師',
  leave_type_label: '事假',
  substitute_status: 'pending',
  start_date: '2026-08-25',
  end_date: '2026-08-25',
  leave_hours: 8,
  reason: '家中有事',
  created_at: '2026-08-24T09:00:00',
}

const STUBS = {
  PortalLeaveList: {
    props: ['refreshTrigger'],
    template: '<div class="leave-list-stub" />',
  },
  PortalLeaveForm: {
    props: ['allEmployees'],
    template: '<div class="leave-form-stub" />',
  },
  TeacherBottomSheet: {
    props: ['modelValue', 'title'],
    template: '<div class="bottom-sheet-stub"><slot v-if="modelValue" /></div>',
  },
}

async function mountView() {
  const wrapper = mount(PortalLeaveView, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PortalLeaveView smoke', () => {
  beforeEach(() => {
    mockColleagues.mockReset().mockResolvedValue({ data: [] })
    mockStats.mockReset().mockResolvedValue({ data: STATS })
    mockSubstitutes.mockReset().mockResolvedValue({ data: [] })
    mockRespond.mockReset()
    vi.mocked(ElMessage.success).mockReset()
    vi.mocked(ElMessage.error).mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('渲染特休摘要（剩餘天數是主角，年資與到職日退為背景）', async () => {
    // 2026-09-03 UI/UX 稽核 P2-07：原本是 5 個大數字方塊（到職日／年資／
    // 法定特休／今年已休／剩餘可用），改成一句話，老師要的「還剩幾天」直接可讀。
    const wrapper = await mountView()
    const text = wrapper.text()
    // 剩餘可用 = quota 15 - used 4
    expect(text).toContain('特休還剩')
    expect(text).toContain('11')
    expect(text).toContain('今年已休 4 天')
    expect(text).toContain('全年 15 天')
    // 到職日與年資仍在，只是降為次要資訊
    expect(text).toContain('2020-08-01')
    expect(text).toContain('6 年 0 個月')
  })

  it('無代理請求時不顯示待回應 alert、顯示空狀態', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('待回應代理請求')
    expect(wrapper.text()).toContain('目前無待代理的假單')
  })

  it('有 pending 代理請求時顯示 alert 與接受/拒絕操作', async () => {
    mockSubstitutes.mockResolvedValue({ data: [PENDING_SUBSTITUTE] })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('您有 1 筆待回應代理請求')
    expect(wrapper.text()).toContain('王老師')
    const accept = wrapper.findAll('button').find((b) => b.text().includes('接受'))
    expect(accept).toBeTruthy()
  })

  it('按接受呼叫 respondToSubstitute 並重抓清單', async () => {
    mockSubstitutes.mockResolvedValue({ data: [PENDING_SUBSTITUTE] })
    mockRespond.mockResolvedValue({ data: { message: 'ok' } })
    const wrapper = await mountView()

    const accept = wrapper.findAll('button').find((b) => b.text().includes('接受'))
    await accept!.trigger('click')
    await flushPromises()

    expect(mockRespond).toHaveBeenCalledWith(7, { action: 'accept' })
    expect(mockSubstitutes).toHaveBeenCalledTimes(2) // onMounted + respond 後 refetch
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('按「新增請假」開啟表單', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.leave-form-stub').exists()).toBe(false)
    const btn = wrapper.findAll('button').find((b) => b.text().includes('新增請假'))
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.leave-form-stub').exists()).toBe(true)
  })
})
