import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ClassroomView from '@/views/ClassroomView.vue'

// ── 2026-08-24 班級管理頁 UI/UX 改版回歸 ──────────────────────────────────
// 涵蓋：可點擊統計列（接近額滿/已滿/未指派班導）、年級客端篩選、卡片學生預覽
// 頭像（student_preview 首度上 UI）、歷史紀錄併入 ⋯ 選單、工具列收斂。

const push = vi.fn(() => Promise.resolve())

let classroomsResponse: () => Promise<{ data: unknown[] }> = () => Promise.resolve({ data: [] })
const getClassrooms = vi.fn(() => classroomsResponse())
const getClassroom = vi.fn(() => Promise.resolve({ data: { id: 1, students: [] } }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

vi.mock('@/api/classrooms', () => ({
  createClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
  getClassroom: (...args: unknown[]) => getClassroom(...(args as [])),
  getClassrooms: (...args: unknown[]) => getClassrooms(...(args as [])),
  getGrades: vi.fn(() => Promise.resolve({
    data: [
      { id: 1, name: '幼幼班', sort_order: 1 },
      { id: 2, name: '小班', sort_order: 2 },
      { id: 3, name: '中班', sort_order: 3 },
      { id: 4, name: '大班', sort_order: 4 },
    ],
  })),
  getTeacherOptions: vi.fn(() => Promise.resolve({ data: [] })),
  updateClassroom: vi.fn(),
}))

vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn(() => Promise.resolve({ data: { rows: [] } })),
}))

vi.mock('@/api/classroomYearPlan', () => ({
  getClassroomYearPlanStatus: vi.fn(() => Promise.resolve({
    data: {
      state: 'none',
      target_school_year: 115,
      source_school_year: 114,
      blocking_count: 0,
      warning_count: 0,
      prep_start_date: '2026-06-01',
      apply_overdue: false,
    },
  })),
}))

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ refresh: vi.fn(() => Promise.resolve()) }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

const baseRow = {
  school_year: 114,
  semester: 1,
  semester_label: '114學年度上學期',
  is_active: true,
}

// 三班組合刻意涵蓋三種容量狀態：正常（向日葵 15/30）、已滿（玫瑰 25/25）、
// 接近額滿且未指派班導（百合 18/20 = 90%）。
const threeClassrooms = [
  {
    ...baseRow,
    id: 1,
    name: '向日葵班',
    class_code: 'SUN-01',
    grade_name: '中班',
    capacity: 30,
    current_count: 15,
    head_teacher_name: '王老師',
    assistant_teacher_name: '林老師',
    student_preview: [
      { id: 11, name: '小安' },
      { id: 12, name: '小寶' },
      { id: 13, name: '小晴' },
    ],
    has_more_students: true,
  },
  {
    ...baseRow,
    id: 2,
    name: '玫瑰班',
    class_code: 'ROSE-01',
    grade_name: '大班',
    capacity: 25,
    current_count: 25,
    head_teacher_name: '林老師',
  },
  {
    ...baseRow,
    id: 3,
    name: '百合班',
    class_code: 'LILY-01',
    grade_name: '大班',
    capacity: 20,
    current_count: 18,
    head_teacher_name: null,
  },
]

const stubs = {
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': true,
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<button type="button"><slot /></button>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-card': { template: '<div class="el-card"><slot name="header" /><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': { template: '<div class="el-empty"><slot /></div>' },
  'el-skeleton': { template: '<div class="el-skeleton-stub"></div>' },
  'el-skeleton-item': true,
  'el-progress': { template: '<div class="el-progress-stub"></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-input': true,
  'el-input-number': true,
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-alert': true,
  'el-link': { template: '<a><slot /></a>' },
  'el-drawer': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  ClassroomStudentDrawer: true,
  ClassroomChangeLogDrawer: true,
  EnrollmentRosterDialog: true,
}

function mountView() {
  return mount(ClassroomView, {
    global: {
      directives: { loading: () => {} },
      stubs,
    },
  })
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

interface SetupState {
  classroomSearch: string
  gradeFilter: string | null
  statFilter: string | null
  visibleClassrooms: { id: number }[]
}

const setupState = (wrapper: ReturnType<typeof mountView>): SetupState => (
  (wrapper.vm.$ as unknown as { setupState: SetupState }).setupState
)

describe('ClassroomView 改版：統計列', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
  })

  it('依容量狀態計數：班級數/在籍容量/接近額滿/已滿/未指派班導', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('[data-test="stat-tile-classes"]').text()).toContain('3')
    expect(wrapper.find('[data-test="stat-tile-enrolled"]').text()).toContain('58 / 75')
    expect(wrapper.find('[data-test="stat-tile-near"]').text()).toContain('1')
    expect(wrapper.find('[data-test="stat-tile-full"]').text()).toContain('1')
    expect(wrapper.find('[data-test="stat-tile-nohead"]').text()).toContain('1')
  })

  it('點「已滿」只顯示已滿班級並標記 aria-pressed，再點一次還原', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.findAll('.classroom-card').length).toBe(3)

    const fullTile = wrapper.find('[data-test="stat-tile-full"]')
    await fullTile.trigger('click')
    await nextTick()

    expect(fullTile.attributes('aria-pressed')).toBe('true')
    const cards = wrapper.findAll('.classroom-card')
    expect(cards.length).toBe(1)
    expect(cards[0].text()).toContain('玫瑰班')

    await fullTile.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.classroom-card').length).toBe(3)
  })

  it('點「未指派班導」只剩缺班導的班級', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.find('[data-test="stat-tile-nohead"]').trigger('click')
    await nextTick()

    const cards = wrapper.findAll('.classroom-card')
    expect(cards.length).toBe(1)
    expect(cards[0].text()).toContain('百合班')
  })
})

describe('ClassroomView 改版：年級篩選', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
  })

  it('gradeFilter 收斂 visibleClassrooms 與卡片', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    state.gradeFilter = '大班'
    await nextTick()

    expect(state.visibleClassrooms.map((c) => c.id)).toEqual([2, 3])
    expect(wrapper.findAll('.classroom-card').length).toBe(2)
  })

  it('搜尋 + 統計篩選同時生效（交集）', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    // 林老師帶玫瑰班（已滿）、也是向日葵班副班——搜尋只比對班名/班導
    state.classroomSearch = '林老師'
    await nextTick()
    expect(wrapper.findAll('.classroom-card').length).toBe(1)

    await wrapper.find('[data-test="stat-tile-near"]').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.classroom-card').length).toBe(0)
  })
})

describe('ClassroomView 改版：卡片內容', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
  })

  it('顯示 student_preview 頭像（姓名末字）與學生人數', async () => {
    const wrapper = mountView()
    await flush()

    const card = wrapper.findAll('.classroom-card')[0]
    const avatars = card.findAll('.student-avatar')
    expect(avatars.length).toBe(3)
    expect(avatars.map((a) => a.text()).join('')).toBe('安寶晴')
    expect(card.text()).toContain('15 名學生')
  })

  it('卡片不再重複顯示學期標籤（頁面已鎖定學期）', async () => {
    const wrapper = mountView()
    await flush()

    const card = wrapper.findAll('.classroom-card')[0]
    expect(card.text()).not.toContain('學年度')
  })

  it('容量狀態文案：已滿/接近額滿・尚餘 N 名/尚餘 N 名', async () => {
    const wrapper = mountView()
    await flush()

    const cards = wrapper.findAll('.classroom-card')
    expect(cards[0].text()).toContain('尚餘 15 名')
    expect(cards[1].text()).toContain('已滿')
    expect(cards[2].text()).toContain('接近額滿・尚餘 2 名')
  })

  it('「歷史紀錄」併入 ⋯ 選單，不再是卡片上的獨立按鈕', async () => {
    const wrapper = mountView()
    await flush()

    const actions = wrapper.findAll('.classroom-card')[0].find('.card-actions')
    expect(actions.text()).toContain('歷史紀錄')
    expect(actions.text()).toContain('編輯班級')

    const buttonLabels = wrapper.findAll('button').map((b) => b.text())
    expect(buttonLabels).not.toContain('歷史紀錄')
  })

  it('未指派班導顯示警示 chip', async () => {
    const wrapper = mountView()
    await flush()

    const lily = wrapper.findAll('.classroom-card')[2]
    expect(lily.find('.teacher-chip--missing').exists()).toBe(true)
    expect(lily.find('.teacher-chip--missing').text()).toContain('未指派班導')
  })
})

describe('ClassroomView 改版：工具列收斂', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
  })

  it('標題列不再有「重新整理」，顯示停用開關移入工具列', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).not.toContain('重新整理')
    const toggle = wrapper.find('.show-inactive-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toContain('顯示停用班級')
  })

  it('頁首帶副標', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('各班在籍概況')
  })

  it('篩選後無結果顯示「清除篩選條件」，點擊還原', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    state.classroomSearch = '不存在的班級'
    await nextTick()

    expect(wrapper.findAll('.classroom-card').length).toBe(0)
    const clearBtn = wrapper.find('[data-test="clear-filters"]')
    expect(clearBtn.exists()).toBe(true)

    await clearBtn.trigger('click')
    await nextTick()

    expect(state.classroomSearch).toBe('')
    expect(wrapper.findAll('.classroom-card').length).toBe(3)
  })
})
