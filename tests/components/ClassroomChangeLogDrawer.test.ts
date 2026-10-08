import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClassroomChangeLogDrawer from '@/components/classroom/ClassroomChangeLogDrawer.vue'

const mockGetChangeLogs = vi.fn()
const mockGetChangeLogsSummary = vi.fn()
vi.mock('@/api/studentChangeLogs', () => ({
  getChangeLogs: (...args: unknown[]) => mockGetChangeLogs(...args),
  getChangeLogsSummary: (...args: unknown[]) => mockGetChangeLogsSummary(...args),
  exportChangeLogs: vi.fn(),
}))
vi.mock('@/api/studentCommunications', () => ({ getCommunications: vi.fn() }))
vi.mock('@/api/classrooms', () => ({ getClassroomEnrollmentComposition: vi.fn() }))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 115, semester: 1 }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => false }))

// 父層（ClassroomView）傳進來的是「列表列」：有 current_count，沒有 students
const listRow = { id: 3, name: '天堂鳥', current_count: 20 }

async function mountOpened(classroom: Record<string, unknown> = listRow) {
  const wrapper = mount(ClassroomChangeLogDrawer, {
    // 抽屜只在 visible／classroom.id 變動時載入資料，所以先關著再打開
    props: { visible: false, classroom },
    global: {
      plugins: [ElementPlus],
      stubs: { teleport: true, 'el-drawer': { template: '<div><slot /></div>' } },
    },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

const cardText = (wrapper: ReturnType<typeof mount>, cls: string) =>
  wrapper.find(cls).text()

describe('ClassroomChangeLogDrawer 統計卡', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChangeLogs.mockResolvedValue({ data: { items: [], total: 0 } })
    mockGetChangeLogsSummary.mockResolvedValue({ data: { summary: { 退學: 1 } } })
  })

  it('classroom 只給 current_count（無 students）時，保留率以它為基數：(20-1)/20 = 95%', async () => {
    const wrapper = await mountOpened()

    expect(cardText(wrapper, '.stat-ratio')).toContain('95%')
  })

  it('同時有 current_count 與 students 時，以 current_count 為準', async () => {
    const wrapper = await mountOpened({
      ...listRow,
      students: [{ id: 1 }, { id: 2 }],
    })

    expect(cardText(wrapper, '.stat-ratio')).toContain('95%')
  })

  it('沒有 current_count 時退回 students 長度', async () => {
    const wrapper = await mountOpened({
      id: 3,
      name: '天堂鳥',
      students: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
    })

    expect(cardText(wrapper, '.stat-ratio')).toContain('90%')
  })

  it('兩者都沒有（基數為 0）時保留率顯示「—」', async () => {
    const wrapper = await mountOpened({ id: 3, name: '天堂鳥' })

    expect(cardText(wrapper, '.stat-ratio')).toContain('—')
  })

  it('卡片標籤為「入班」「離班」（不再有字間半形空白）', async () => {
    const wrapper = await mountOpened()

    expect(cardText(wrapper, '.stat-enter')).toContain('入班')
    expect(cardText(wrapper, '.stat-leave')).toContain('離班')
    const text = wrapper.text()
    expect(text).not.toContain('收 入')
    expect(text).not.toContain('離 班')
  })

  it('入班／離班／淨異動數字由 summary 彙總', async () => {
    mockGetChangeLogsSummary.mockResolvedValue({
      data: { summary: { 入學: 2, 轉入: 1, 退學: 1, 休學: 1 } },
    })
    const wrapper = await mountOpened()

    expect(cardText(wrapper, '.stat-enter')).toContain('3')
    expect(cardText(wrapper, '.stat-leave')).toContain('2')
    expect(cardText(wrapper, '.stat-net')).toContain('+1')
  })
})
