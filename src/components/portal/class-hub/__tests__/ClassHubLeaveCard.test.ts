import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'

import ClassHubLeaveCard from '../ClassHubLeaveCard.vue'

vi.mock('@/api/portalStudentLeaves', () => ({
  listPortalStudentLeaves: vi.fn(),
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// v-loading 是 Element Plus 的指令，元件測試不掛整包 EP，給個 no-op stub
const mountCard = () =>
  mount(ClassHubLeaveCard, {
    global: {
      directives: { loading: {} },
      stubs: { RouterLink: RouterLinkStub },
    },
  })

const leaveItem = {
  id: 1,
  student_id: 10,
  student_name: '王小明',
  classroom_id: 3,
  leave_type: '病假',
  start_date: '2026-12-15',
  end_date: '2026-12-17',
  reason: '發燒',
  status: 'approved',
  created_at: null,
}

describe('ClassHubLeaveCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('列出近期請假的學生姓名、假別與期間', async () => {
    const { listPortalStudentLeaves } = await import('@/api/portalStudentLeaves')
    vi.mocked(listPortalStudentLeaves).mockResolvedValue({
      data: { items: [leaveItem], total: 1 },
    } as never)

    const wrapper = mountCard()
    await flush()

    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('病假')
    expect(wrapper.text()).toContain('2026-12-15')
  })

  it('無資料時顯示空狀態', async () => {
    const { listPortalStudentLeaves } = await import('@/api/portalStudentLeaves')
    vi.mocked(listPortalStudentLeaves).mockResolvedValue({
      data: { items: [], total: 0 },
    } as never)

    const wrapper = mountCard()
    await flush()

    expect(wrapper.text()).toContain('近期沒有請假')
  })

  it('載入失敗時顯示錯誤，不得顯示空狀態', async () => {
    // 對照 PortalClassHubView 既有設計約束：網路失敗被誤讀為「今天沒人請假」
    // 是安全隱患，error 與 empty 必須分辨。
    const { listPortalStudentLeaves } = await import('@/api/portalStudentLeaves')
    vi.mocked(listPortalStudentLeaves).mockRejectedValue(new Error('network'))

    const wrapper = mountCard()
    await flush()

    expect(wrapper.text()).toContain('載入失敗')
    expect(wrapper.text()).not.toContain('近期沒有請假')
  })

  it('提供「查看全部」連結導向學生請假頁', async () => {
    const { listPortalStudentLeaves } = await import('@/api/portalStudentLeaves')
    vi.mocked(listPortalStudentLeaves).mockResolvedValue({
      data: { items: [leaveItem], total: 1 },
    } as never)

    const wrapper = mountCard()
    await flush()

    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toBe('/portal/student-leaves')
    expect(link.text()).toContain('查看全部')
  })

  it('單日請假只顯示一個日期', async () => {
    const { listPortalStudentLeaves } = await import('@/api/portalStudentLeaves')
    vi.mocked(listPortalStudentLeaves).mockResolvedValue({
      data: {
        items: [{ ...leaveItem, start_date: '2026-12-15', end_date: '2026-12-15' }],
        total: 1,
      },
    } as never)

    const wrapper = mountCard()
    await flush()

    expect(wrapper.text()).toContain('2026-12-15')
    expect(wrapper.text()).not.toContain('~')
  })
})
