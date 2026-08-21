import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/portalStudentLeaves', () => ({
  listPortalStudentLeaves: vi.fn(),
}))
vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(),
}))

import { getMyStudents } from '@/api/portal'
import { listPortalStudentLeaves } from '@/api/portalStudentLeaves'
import PortalStudentLeavesView from '../PortalStudentLeavesView.vue'

// 固定「今天」= 2026-08-21（週五）；用中午避免時區換日邊界
const NOW = new Date('2026-08-21T12:00:00+08:00')

const classroomBlock = (id: number, name: string) => ({
  classroom_id: id,
  classroom_name: name,
  role: 'homeroom',
  student_count: 10,
  students: [],
})

const leaveFixture = {
  id: 1,
  student_id: 10,
  student_name: '王小明',
  classroom_id: 3,
  leave_type: '病假',
  start_date: '2026-08-20',
  end_date: '2026-08-22',
  reason: '發燒',
  status: 'approved',
  created_at: '2026-08-19T21:30:00',
}

const futureLeave = {
  ...leaveFixture,
  id: 2,
  student_id: 11,
  student_name: '林小美',
  leave_type: '事假',
  start_date: '2026-08-25',
  end_date: '2026-08-25',
  reason: null,
  created_at: null,
}

const mockLeaves = (items: unknown[]) => {
  vi.mocked(listPortalStudentLeaves).mockResolvedValue({
    data: { items, total: items.length },
  } as never)
}

const mountView = () => mount(PortalStudentLeavesView)

describe('PortalStudentLeavesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.mocked(getMyStudents).mockResolvedValue({
      data: {
        classrooms: [classroomBlock(3, '向日葵班')],
        employee_name: '陳老師',
        total_students: 10,
      },
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('今日請假摘要只列出區間涵蓋今天的學生', async () => {
    mockLeaves([leaveFixture, futureLeave])
    const wrapper = mountView()
    await flushPromises()

    const today = wrapper.find('[data-test="today-section"]')
    expect(today.exists()).toBe(true)
    expect(today.text()).toContain('王小明')
    expect(today.text()).not.toContain('林小美')
    expect(wrapper.find('[data-test="today-count"]').text()).toContain('1')
  })

  it('清單列出所有請假的學生、班級、假別與期間', async () => {
    mockLeaves([leaveFixture, futureLeave])
    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-test="leave-row"]')
    expect(rows).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('王小明')
    expect(text).toContain('林小美')
    expect(text).toContain('向日葵班')
    expect(text).toContain('病假')
    expect(text).toContain('事假')
    expect(text).toContain('2026-08-20 ~ 2026-08-22')
    // 單日請假只顯示一個日期
    expect(text).not.toContain('2026-08-25 ~')
  })

  it('點「今天」快捷範圍會以今天為起訖重新查詢', async () => {
    mockLeaves([leaveFixture])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-test="range-today"]').trigger('click')
    await flushPromises()

    expect(listPortalStudentLeaves).toHaveBeenLastCalledWith(
      expect.objectContaining({ start_date: '2026-08-21', end_date: '2026-08-21' }),
    )
  })

  it('任教多班時顯示班級篩選，點選後帶 classroom_id 重新查詢', async () => {
    vi.mocked(getMyStudents).mockResolvedValue({
      data: {
        classrooms: [classroomBlock(3, '向日葵班'), classroomBlock(4, '太陽班')],
        employee_name: '陳老師',
        total_students: 20,
      },
    } as never)
    mockLeaves([leaveFixture])
    const wrapper = mountView()
    await flushPromises()

    const chips = wrapper.findAll('[data-test="classroom-chip"]')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    const sunflower = chips.find((c) => c.text().includes('向日葵班'))
    await sunflower!.trigger('click')
    await flushPromises()

    expect(listPortalStudentLeaves).toHaveBeenLastCalledWith(
      expect.objectContaining({ classroom_id: 3 }),
    )
  })

  it('單一任教班級時不顯示班級篩選', async () => {
    mockLeaves([leaveFixture])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="classroom-chip"]').exists()).toBe(false)
  })

  it('假別篩選只影響清單，不重新打 API', async () => {
    mockLeaves([leaveFixture, futureLeave])
    const wrapper = mountView()
    await flushPromises()
    const callsBefore = vi.mocked(listPortalStudentLeaves).mock.calls.length

    const chips = wrapper.findAll('[data-test="type-chip"]')
    const sick = chips.find((c) => c.text() === '病假')
    await sick!.trigger('click')

    const rows = wrapper.findAll('[data-test="leave-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('王小明')
    expect(vi.mocked(listPortalStudentLeaves).mock.calls.length).toBe(callsBefore)
  })

  it('自訂範圍不含今天時，不顯示今日區塊', async () => {
    mockLeaves([futureLeave])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-test="custom-start"]').setValue('2026-09-01')
    await wrapper.find('[data-test="custom-end"]').setValue('2026-09-05')
    await flushPromises()

    expect(listPortalStudentLeaves).toHaveBeenLastCalledWith(
      expect.objectContaining({ start_date: '2026-09-01', end_date: '2026-09-05' }),
    )
    expect(wrapper.find('[data-test="today-section"]').exists()).toBe(false)
  })

  it('無資料時清單顯示空狀態、今日區塊顯示今天沒人請假', async () => {
    mockLeaves([])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('目前範圍內沒有學生請假')
    expect(wrapper.find('[data-test="today-section"]').text()).toContain('今天沒有學生請假')
  })

  it('載入失敗顯示錯誤與重試，不得顯示空狀態', async () => {
    // 同 ClassHubLeaveCard 的既有安全約束：網路失敗不可被誤讀為「沒人請假」
    vi.mocked(listPortalStudentLeaves).mockRejectedValue(new Error('network'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('載入失敗')
    expect(wrapper.text()).not.toContain('目前範圍內沒有學生請假')
    expect(wrapper.text()).not.toContain('今天沒有學生請假')

    // 重試成功後恢復正常顯示
    mockLeaves([leaveFixture])
    await wrapper.find('[data-test="retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('王小明')
  })
})
