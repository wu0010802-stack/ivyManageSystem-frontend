import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/activity', () => ({
  getPOSSemesterRegistrationChanges: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

import { getPOSSemesterRegistrationChanges } from '@/api/activity'
import POSRegChangesTimeline from '../POSRegChangesTimeline.vue'

function mountTimeline(props: Record<string, unknown> = {}) {
  return mount(POSRegChangesTimeline, {
    props: { schoolYear: 115, semester: 1, ...props },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-checkbox-group': true,
        'el-checkbox': true,
        'el-alert': true,
        'el-empty': true,
        'el-timeline': true,
        'el-timeline-item': true,
        'el-tag': true,
      },
    },
  })
}

function setupStateOf(wrapper: ReturnType<typeof mountTimeline>) {
  return wrapper.vm.$.setupState as {
    items: Record<string, unknown>[]
    total: number
    truncated: boolean
    selectedTypes: string[]
  }
}

describe('POSRegChangesTimeline', () => {
  beforeEach(() => {
    vi.mocked(getPOSSemesterRegistrationChanges).mockResolvedValue({
      data: {
        school_year: 115,
        semester: 1,
        total: 2,
        truncated: false,
        items: [
          {
            created_at: '2026-08-10T09:00:00',
            student_name: '王小明',
            class_name: '大班',
            change_type: '退課',
            description: '課程「直排輪」（自動沖帳退費 NT$800）',
            changed_by: 'staff1',
          },
          {
            created_at: '2026-08-11T09:00:00',
            student_name: '李小美',
            class_name: '中班',
            change_type: '新增課程',
            description: '課程「畫畫」（enrolled，價 $2000）',
            changed_by: 'staff2',
          },
        ],
      },
    } as never)
  })
  afterEach(() => vi.clearAllMocks())

  it('mount 時依學年/學期＋預設四類型載入', async () => {
    const wrapper = mountTimeline()
    await flushPromises()

    expect(getPOSSemesterRegistrationChanges).toHaveBeenCalledWith({
      school_year: 115,
      semester: 1,
      types: '新增課程,新增用品,移除用品,退課',
    })
    const ss = setupStateOf(wrapper)
    expect(ss.items).toHaveLength(2)
    expect(ss.total).toBe(2)
  })

  it('truncated 為真時保留於狀態供警示顯示', async () => {
    vi.mocked(getPOSSemesterRegistrationChanges).mockResolvedValue({
      data: { school_year: 115, semester: 1, total: 999, truncated: true, items: [] },
    } as never)
    const wrapper = mountTimeline()
    await flushPromises()
    expect(setupStateOf(wrapper).truncated).toBe(true)
  })

  it('切學期時重新載入', async () => {
    const wrapper = mountTimeline({ schoolYear: 115, semester: 1 })
    await flushPromises()
    vi.mocked(getPOSSemesterRegistrationChanges).mockClear()

    await wrapper.setProps({ schoolYear: 115, semester: 2 })
    await flushPromises()

    expect(getPOSSemesterRegistrationChanges).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 115, semester: 2 })
    )
  })

  it('無資料時 items 為空陣列', async () => {
    vi.mocked(getPOSSemesterRegistrationChanges).mockResolvedValue({
      data: { school_year: 115, semester: 1, total: 0, truncated: false, items: [] },
    } as never)
    const wrapper = mountTimeline()
    await flushPromises()
    expect(setupStateOf(wrapper).items).toEqual([])
  })
})
