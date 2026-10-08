import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ClassroomView from '@/views/ClassroomView.vue'
import { tenantGetItem, tenantRemoveItem } from '@/utils/tenantStorage'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'

// ── 2026-08-24 班級管理頁 UI/UX 改版回歸 ──────────────────────────────────
// 涵蓋：可點擊統計列（接近額滿/已滿/未指派班導）、年級客端篩選、卡片學生預覽
// 頭像（student_preview 首度上 UI）、異動紀錄併入 ⋯ 選單、工具列收斂。
// 2026-10-08 第二輪：預設改為年級分組密集表（viewMode='table'），卡片為次要檢視；
// 篩選類案例以預設的表格列（classroom-row）驗證，卡片專屬案例先切到 viewMode='card'。

const push = vi.fn(() => Promise.resolve())

let classroomsResponse: () => Promise<{ data: unknown[] }> = () => Promise.resolve({ data: [] })
const getClassrooms = vi.fn(() => classroomsResponse())
const VIEW_MODE_KEY = 'classrooms_view_mode'
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

// 切到卡片檢視：走真實的檢視切換鈕（同時驗證切換鈕本身可用）
const switchToCard = async (wrapper: ReturnType<typeof mountView>) => {
  await wrapper.find('[data-test="view-toggle-card"]').trigger('click')
  await nextTick()
}

const rows = (wrapper: ReturnType<typeof mountView>) => wrapper.findAll('[data-test="classroom-row"]')

interface SetupState {
  viewMode: 'table' | 'card'
  fetchClassrooms: () => Promise<void>
  classroomSearch: string
  gradeFilter: string | null
  statFilter: string | null
  visibleClassrooms: { id: number }[]
}

const setupState = (wrapper: ReturnType<typeof mountView>): SetupState => (
  (wrapper.vm.$ as unknown as { setupState: SetupState }).setupState
)

const resetEach = () => {
  vi.clearAllMocks()
  tenantRemoveItem(VIEW_MODE_KEY)
  classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
}

describe('ClassroomView 改版：統計列', () => {
  beforeEach(resetEach)

  it('依容量狀態計數：班級數/在籍容量/接近額滿/已滿/未指派班導', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('[data-test="stat-tile-classes"]').text()).toContain('3')
    expect(wrapper.find('[data-test="stat-tile-enrolled"]').text()).toContain('58 / 75')
    expect(wrapper.find('[data-test="stat-tile-near"]').text()).toContain('1')
    expect(wrapper.find('[data-test="stat-tile-full"]').text()).toContain('1')
    expect(wrapper.find('[data-test="stat-tile-nohead"]').text()).toContain('1')
  })

  it('狀態列一條：班級數帶尚餘名額；快篩 chip 數值為 0 才加 is-zero（0 不上色）', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('[data-test="stat-tile-classes"]').text()).toContain('尚餘 17 名')
    for (const key of ['near', 'full', 'nohead']) {
      expect(wrapper.find(`[data-test="stat-tile-${key}"]`).classes()).not.toContain('is-zero')
    }

    classroomsResponse = () => Promise.resolve({ data: [threeClassrooms[0]] })
    const calm = mountView()
    await flush()
    for (const key of ['near', 'full', 'nohead']) {
      expect(calm.find(`[data-test="stat-tile-${key}"]`).classes()).toContain('is-zero')
    }
  })

  it('點「已滿」只顯示已滿班級並標記 aria-pressed，再點一次還原', async () => {
    const wrapper = mountView()
    await flush()

    expect(rows(wrapper).length).toBe(3)

    const fullTile = wrapper.find('[data-test="stat-tile-full"]')
    await fullTile.trigger('click')
    await nextTick()

    expect(fullTile.attributes('aria-pressed')).toBe('true')
    expect(rows(wrapper).length).toBe(1)
    expect(rows(wrapper)[0].text()).toContain('玫瑰班')

    await fullTile.trigger('click')
    await nextTick()
    expect(rows(wrapper).length).toBe(3)
  })

  it('點「未指派班導」只剩缺班導的班級', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.find('[data-test="stat-tile-nohead"]').trigger('click')
    await nextTick()

    expect(rows(wrapper).length).toBe(1)
    expect(rows(wrapper)[0].text()).toContain('百合班')
  })
})

describe('ClassroomView 改版：年級篩選', () => {
  beforeEach(resetEach)

  it('gradeFilter 收斂 visibleClassrooms 與表格列', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    state.gradeFilter = '大班'
    await nextTick()

    expect(state.visibleClassrooms.map((c) => c.id)).toEqual([2, 3])
    expect(rows(wrapper).length).toBe(2)
  })

  it('卡片檢視同樣吃篩選：gradeFilter 收斂卡片數', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)
    const state = setupState(wrapper)

    state.gradeFilter = '大班'
    await nextTick()

    expect(wrapper.findAll('.classroom-card').length).toBe(2)
  })

  it('搜尋 + 統計篩選同時生效（交集）', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    // 林老師帶玫瑰班（已滿）、也是向日葵班副班——搜尋只比對班名/代號/班導
    state.classroomSearch = '林老師'
    await nextTick()
    expect(rows(wrapper).length).toBe(1)

    await wrapper.find('[data-test="stat-tile-near"]').trigger('click')
    await nextTick()
    expect(rows(wrapper).length).toBe(0)
  })

  it('搜尋涵蓋班級代號；filteredClassrooms 仍是僅關鍵字語意', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    state.classroomSearch = 'rose'
    await nextTick()

    expect(state.visibleClassrooms.map((c) => c.id)).toEqual([2])
    expect(rows(wrapper).length).toBe(1)
  })
})

describe('ClassroomView 改版：檢視切換（表格 / 卡片）', () => {
  beforeEach(resetEach)

  it('預設渲染年級分組表，不渲染卡片；表格切換鈕 aria-pressed=true', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('[data-test="classroom-table"]').exists()).toBe(true)
    expect(wrapper.findAll('.classroom-card').length).toBe(0)
    expect(wrapper.find('[data-test="view-toggle-table"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-test="view-toggle-card"]').attributes('aria-pressed')).toBe('false')
    // 組序依 grades.sort_order（中班 3、大班 4），不是班級清單的出現順序
    expect(wrapper.findAll('[data-test="group-row"]').map((g) => g.find('.group-name').text())).toEqual(['中班', '大班'])
  })

  it('切到卡片：表格消失、卡片出現、偏好寫入 tenantStorage；重新 mount 還原卡片', async () => {
    const first = mountView()
    await flush()
    await switchToCard(first)

    expect(first.find('[data-test="classroom-table"]').exists()).toBe(false)
    expect(first.findAll('.classroom-card').length).toBe(3)
    expect(first.find('[data-test="view-toggle-card"]').attributes('aria-pressed')).toBe('true')
    expect(tenantGetItem(VIEW_MODE_KEY)).toBe('card')
    first.unmount()

    const second = mountView()
    await flush()
    expect(second.findAll('.classroom-card').length).toBe(3)
    expect(second.find('[data-test="classroom-table"]').exists()).toBe(false)
    expect(second.find('[data-test="view-toggle-card"]').attributes('aria-pressed')).toBe('true')
  })

  it('切回表格會覆寫偏好；非法的儲存值一律當作 table', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)
    await wrapper.find('[data-test="view-toggle-table"]').trigger('click')
    await nextTick()

    expect(tenantGetItem(VIEW_MODE_KEY)).toBe('table')
    expect(wrapper.find('[data-test="classroom-table"]').exists()).toBe(true)
    wrapper.unmount()

    localStorage.setItem(VIEW_MODE_KEY, 'grid')
    const odd = mountView()
    await flush()
    expect(odd.find('[data-test="classroom-table"]').exists()).toBe(true)
  })

  it('表格列的班名按鈕接上名冊抽屜（getClassroom）', async () => {
    const wrapper = mountView()
    await flush()

    await wrapper.find('[data-test="classroom-row"] .class-name-btn').trigger('click')
    await flush()
    expect(getClassroom).toHaveBeenCalledWith(1)
  })
})

describe('ClassroomView 改版：卡片內容（卡片檢視）', () => {
  beforeEach(resetEach)

  it('顯示 student_preview 頭像（姓名末字）與學生人數', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)

    const card = wrapper.findAll('.classroom-card')[0]
    const avatars = card.findAll('.student-avatar')
    expect(avatars.length).toBe(3)
    expect(avatars.map((a) => a.text()).join('')).toBe('安寶晴')
    expect(card.text()).toContain('15 名學生')
  })

  it('卡片不再重複顯示學期標籤（頁面已鎖定學期）', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)

    const card = wrapper.findAll('.classroom-card')[0]
    expect(card.text()).not.toContain('學年度')
  })

  it('容量狀態文案：已滿/接近額滿・尚餘 N 名/尚餘 N 名', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)

    const cards = wrapper.findAll('.classroom-card')
    expect(cards[0].text()).toContain('尚餘 15 名')
    expect(cards[1].text()).toContain('已滿')
    expect(cards[2].text()).toContain('接近額滿・尚餘 2 名')
  })

  it('「異動紀錄」併入 ⋯ 選單（原「歷史紀錄」改名），不再是卡片上的獨立按鈕', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)

    const actions = wrapper.findAll('.classroom-card')[0].find('.card-actions')
    expect(actions.text()).toContain('異動紀錄')
    expect(actions.text()).toContain('編輯班級')
    expect(actions.text()).not.toContain('歷史紀錄')

    const buttonLabels = wrapper.findAll('button').map((b) => b.text())
    expect(buttonLabels).not.toContain('異動紀錄')
  })

  it('卡片 ⋯ 選單的停用項同樣防呆：仍有在學生者顯示原因', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)

    const cards = wrapper.findAll('.classroom-card')
    expect(cards[0].find('.card-actions').text()).toContain('仍有 15 名在學，請先轉班')
    expect(cards[1].find('.card-actions').text()).toContain('仍有 25 名在學，請先轉班')
  })

  it('未指派班導顯示警示 chip', async () => {
    const wrapper = mountView()
    await flush()
    await switchToCard(wrapper)

    const lily = wrapper.findAll('.classroom-card')[2]
    expect(lily.find('.teacher-chip--missing').exists()).toBe(true)
    expect(lily.find('.teacher-chip--missing').text()).toContain('未指派班導')
  })
})

describe('ClassroomView 改版：工具列收斂', () => {
  beforeEach(resetEach)

  it('標題列不再有「重新整理」，顯示停用開關移入工具列', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).not.toContain('重新整理')
    const toggle = wrapper.find('.show-inactive-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toContain('顯示停用班級')
  })

  it('頁首帶副標；「統計表」按鈕改名「在籍記錄表」', async () => {
    const wrapper = mountView()
    await flush()

    expect(wrapper.text()).toContain('各班在籍概況')
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toContain('在籍記錄表')
    expect(labels).not.toContain('統計表')
  })

  it('搜尋框 placeholder 涵蓋代號', async () => {
    const wrapper = mountView()
    await flush()

    const toolbar = wrapper.findComponent({ name: 'AdminListToolbar' })
    expect(toolbar.props('searchPlaceholder')).toBe('搜尋班級名稱、代號或班導')
  })

  it('篩選後無結果顯示「清除篩選條件」，點擊還原', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)

    state.classroomSearch = '不存在的班級'
    await nextTick()

    expect(rows(wrapper).length).toBe(0)
    const clearBtn = wrapper.find('[data-test="clear-filters"]')
    expect(clearBtn.exists()).toBe(true)

    await clearBtn.trigger('click')
    await nextTick()

    expect(state.classroomSearch).toBe('')
    expect(rows(wrapper).length).toBe(3)
  })
})

describe('ClassroomView 改版：載入失敗', () => {
  beforeEach(resetEach)

  it('首次載入失敗且無資料：顯示錯誤區塊，不假裝「尚無班級」也不提供新增 CTA', async () => {
    classroomsResponse = () => Promise.reject(new Error('503'))
    const wrapper = mountView()
    await flush()

    const alert = wrapper.find('[data-test="load-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('班級資料載入失敗')
    // 學期與「的」之間不留空格
    expect(alert.text()).toContain('114學年度 上學期的班級清單沒有載入成功')
    expect(wrapper.text()).not.toContain('尚無班級資料')
    expect(wrapper.find('.empty-create-btn').exists()).toBe(false)
    expect(wrapper.find('[data-test="classroom-table"]').exists()).toBe(false)
    // 狀態列也隱藏：「0 班 · 在籍 0 / 0」會和「尚無班級」一樣誤導
    expect(wrapper.find('.roster-stats').exists()).toBe(false)
    // 頁首「新增班級」也隱藏：失敗時使用者可能以為班級不見而重建一份（States mockup A）
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('新增班級')
  })

  it('載入成功時頁首仍有「新增班級」；重試成功後失敗態的隱藏會解除', async () => {
    classroomsResponse = () => Promise.reject(new Error('503'))
    const wrapper = mountView()
    await flush()
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('新增班級')

    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flush()

    expect(wrapper.findAll('button').map((b) => b.text())).toContain('新增班級')
    expect(wrapper.find('.roster-stats').exists()).toBe(true)
  })

  it('按「重新載入」再打一次 getClassrooms；成功後錯誤區塊消失、列表出現', async () => {
    classroomsResponse = () => Promise.reject(new Error('503'))
    const wrapper = mountView()
    await flush()
    expect(getClassrooms).toHaveBeenCalledTimes(1)

    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flush()

    expect(getClassrooms).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false)
    expect(rows(wrapper).length).toBe(3)
  })

  it('確定沒有班級（API 成功回空）仍是「尚無班級資料」＋新增 CTA，與載入失敗區分', async () => {
    classroomsResponse = () => Promise.resolve({ data: [] })
    const wrapper = mountView()
    await flush()

    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('尚無班級資料')
    expect(wrapper.find('.empty-create-btn').exists()).toBe(true)
  })

  it('已有舊資料時重載失敗：保留列表並在上方顯示警示橫幅，重試成功後橫幅消失', async () => {
    const wrapper = mountView()
    await flush()
    const state = setupState(wrapper)
    expect(rows(wrapper).length).toBe(3)

    classroomsResponse = () => Promise.reject(new Error('503'))
    await state.fetchClassrooms()
    await flush()

    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false)
    const banner = wrapper.find('[data-test="load-error-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('最新資料載入失敗，畫面可能不是最新')
    expect(rows(wrapper).length).toBe(3)

    classroomsResponse = () => Promise.resolve({ data: threeClassrooms })
    await wrapper.find('[data-test="load-error-banner-retry"]').trigger('click')
    await flush()
    expect(wrapper.find('[data-test="load-error-banner"]').exists()).toBe(false)
  })
})

describe('ClassroomView 改版：名冊抽屜異動後同步列表', () => {
  beforeEach(resetEach)

  // 停用防呆吃 current_count；使用者照提示在名冊把學生轉班/退學後，列表必須自己更新，
  // 否則停用項會一直 disabled 到整頁重整（student-updated 原本只重開抽屜、不重抓清單）。
  it('抽屜 student-updated 後重抓班級清單：在籍數更新、停用項解鎖', async () => {
    const before = threeClassrooms.map((c) => ({ ...c }))
    const after = threeClassrooms.map((c) => (c.id === 1 ? { ...c, current_count: 0 } : { ...c }))
    classroomsResponse = () => Promise.resolve({ data: before })
    const wrapper = mountView()
    await flush()

    const rowOf = (id: number) => wrapper.find(`[data-test="classroom-row"][data-id="${id}"]`)
    expect(rowOf(1).text()).toContain('15 / 30')
    expect(rowOf(1).text()).toContain('仍有 15 名在學，請先轉班')
    expect(getClassrooms).toHaveBeenCalledTimes(1)

    classroomsResponse = () => Promise.resolve({ data: after })
    wrapper.findComponent(ClassroomStudentDrawer).vm.$emit('student-updated')
    await flush()

    expect(getClassrooms).toHaveBeenCalledTimes(2)
    expect(rowOf(1).text()).toContain('0 / 30')
    expect(rowOf(1).text()).not.toContain('仍有')
    // 其他班不受影響
    expect(rowOf(2).text()).toContain('仍有 25 名在學，請先轉班')
  })
})
