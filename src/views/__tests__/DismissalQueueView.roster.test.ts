/**
 * 接送通知點名單的班級歸屬（2026-07-30 根因迴歸）。
 *
 * /classrooms 預設 current_only=true 只回當期學期的班級，而 /students 不跟學期。
 * 暑假期間學生已編入下學年班級 → 班級查不到 → 全部被誤標「未分班」
 * （staging 實測 198 位在籍學生中 196 位中彈，而 classroom_id IS NULL 的其實是 0 位）。
 *
 * 這裡的 getClassrooms 假件刻意複製後端語義：不帶 current_only=false 就只回當期班級，
 * 所以「畫面顯示正確班名」這件事只有在前端真的把參數帶對時才會綠。
 *
 * 【T-012 改版】isActiveView 原本的「搜尋框＋待接送看板＋點名單」三段已換成
 * DismissalPosBoard（三欄 POS 佈局，D7）。原本用 `.roster-group__name` 直接
 * 在本檔 DOM 斷言的寫法不再適用——shallowMount 下 DismissalPosBoard 本身也是
 * stub，實際分班/去重（buildRoster）邏輯現在活在 DismissalPosStudentGrid.vue
 * 內（另有自己的 __tests__ 覆蓋）。這裡改成斷言 loadClassrooms/loadStudents
 * 撈回來的資料有沒有「正確、完整」地當作 props 傳給 DismissalPosBoard——這正是
 * 本檔原本要保護的迴歸點（current_only 參數有沒有帶對），只是斷言的觀察點從
 * 「畫面上看到的班名」往前移到「餵給 POS 元件的 props」。「其他班級」/「未分班」
 * 這兩種非正常班級分組的提示文字，POS 版重新設計後沒有對應的 UI（左欄班級列表
 * 只列出 props.classrooms 裡的真實班級，沒有「其他班級」/「未分班」這種合成分組
 * 可以選），屬於已知、記錄在 T-012 notes 的能力落差，這裡不再測試該情境。
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
import DismissalPosBoard from '@/components/dismissal/pos/DismissalPosBoard.vue'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

const mountView = async () => {
  const wrapper = shallowMount(DismissalQueueView, { global: globalConfig })
  await flushPromises()
  return wrapper
}

/** DismissalPosBoard 收到的 classrooms/students props（shallowMount 下它本身是 stub，不深入渲染）。 */
const posBoardProps = (wrapper: ReturnType<typeof shallowMount>) =>
  wrapper.findComponent(DismissalPosBoard).props()

describe('DismissalQueueView 點名單班級歸屬', () => {
  beforeEach(() => vi.clearAllMocks())

  it('學生編在非當期學年的班級時，DismissalPosBoard 仍收到該班的正確班級資料（不受 current_only 影響）', async () => {
    const wrapper = await mountView()
    const { classrooms } = posBoardProps(wrapper)
    // 115-1 天堂鳥（id 13）屬於非當期學年，只有 current_only=false 撈回全部班級時才拿得到。
    expect(classrooms.map((c: { id: number }) => c.id)).toContain(13)
  })

  it('三位分屬三個班級的學生都完整傳給 DismissalPosBoard，沒有任何學生被漏掉', async () => {
    const wrapper = await mountView()
    const { students } = posBoardProps(wrapper)
    expect(students).toHaveLength(3)
    expect(new Set(students.map((s: { classroom_id: number }) => s.classroom_id))).toEqual(
      new Set([13, 22, 24]),
    )
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
