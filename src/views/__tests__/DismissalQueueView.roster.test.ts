/**
 * 接送通知點名單的班級歸屬（2026-07-30 根因迴歸）。
 *
 * /classrooms 預設 current_only=true 只回當期學期的班級，而 /students 不跟學期。
 * 暑假期間學生已編入下學年班級 → 班級查不到 → 全部被誤標「未分班」
 * （staging 實測 198 位在籍學生中 196 位中彈，而 classroom_id IS NULL 的其實是 0 位）。
 *
 * 這裡的 getClassrooms 假件刻意複製後端語義：不帶 current_only=false 就只回當期班級，
 * 所以「畫面顯示正確班名」這件事只有在前端真的把參數帶對時才會綠。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// 當期＝114 學年下學期（今天落在 2~7 月的判定結果）；學生卻已編入 115-1 的班。
const ALL_CLASSROOMS = [
  { id: 24, name: '向日葵', school_year: 114, semester: 2, semester_label: '114學年度下學期' },
  { id: 13, name: '天堂鳥', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
  { id: 22, name: '向日葵', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
]

const CURRENT_TERM_CLASSROOMS = ALL_CLASSROOMS.filter(
  c => c.school_year === 114 && c.semester === 2,
)

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn((params?: Record<string, unknown>) =>
    Promise.resolve({
      data: params?.current_only === false ? ALL_CLASSROOMS : CURRENT_TERM_CLASSROOMS,
    }),
  ),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({
    data: {
      items: [
        { id: 1, name: '王小明', classroom_id: 13 }, // 115-1 天堂鳥
        { id: 2, name: '李小美', classroom_id: 22 }, // 115-1 向日葵
        { id: 3, name: '陳大文', classroom_id: 24 }, // 114-2 向日葵
      ],
    },
  }),
}))

vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: vi.fn().mockResolvedValue({ data: [] }),
  cancelDismissalCall: vi.fn(),
  createDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
}))

// 全域 classroomStore 由 8 個頁面共用、且 _createFetchStore 呼叫 apiFn() 不帶參數，
// 只能拿到當期班級——這裡照它現行行為餵當期清單，接送通知頁得自己去抓完整清單。
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({
    classrooms: CURRENT_TERM_CLASSROOMS,
    fetchClassrooms: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  close() {
    this.readyState = FakeWebSocket.CLOSED
  }
}
vi.stubGlobal('WebSocket', FakeWebSocket)

import DismissalQueueView from '@/views/DismissalQueueView.vue'
import { getStudents } from '@/api/students'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

const mountView = async () => {
  const wrapper = shallowMount(DismissalQueueView, { global: globalConfig })
  await flushPromises()
  return wrapper
}

const groupNames = (wrapper: ReturnType<typeof shallowMount>) =>
  wrapper.findAll('.roster-group__name').map(n => n.text())

describe('DismissalQueueView 點名單班級歸屬', () => {
  beforeEach(() => vi.clearAllMocks())

  it('學生編在非當期學年的班級時，仍顯示實際班名而非「未分班」', async () => {
    const wrapper = await mountView()
    const names = groupNames(wrapper)
    expect(names).toContain('天堂鳥')
    expect(names).not.toContain('未分班')
  })

  it('三位學生分屬三個班級，不會被擠進同一組', async () => {
    const wrapper = await mountView()
    expect(groupNames(wrapper)).toHaveLength(3)
  })

  // 班級被停用（getClassrooms 預設不回 inactive）時學生仍會落在「其他班級」，
  // 只給組名的話老師無從判斷這排 chip 是不是壞的、能不能點。
  it('「其他班級」註明仍可通知，「未分班」註明無法通知', async () => {
    vi.mocked(getStudents).mockResolvedValueOnce({
      data: {
        items: [
          { id: 9, name: '林小安', classroom_id: 777 }, // 已停用／查不到的班
          { id: 8, name: '黃小百', classroom_id: null }, // 真的沒有班級
        ],
      },
    } as never)
    const wrapper = await mountView()
    expect(groupNames(wrapper)).toEqual(['其他班級', '未分班'])
    expect(wrapper.findAll('.roster-group__hint').map(n => n.text())).toEqual([
      '班級不在目前清單中，仍可通知',
      '沒有班級，無法通知',
    ])
  })

  it('班級篩選只列出有在籍學生的班級，跨學年同名班帶學期標籤', async () => {
    const wrapper = await mountView()
    const labels = wrapper
      .findAll('[data-testid="dismissal-classroom-option"]')
      .map(o => o.attributes('label'))
    expect(labels).toEqual([
      '向日葵（114學年度下學期）',
      '天堂鳥',
      '向日葵（115學年度上學期）',
    ])
  })
})
