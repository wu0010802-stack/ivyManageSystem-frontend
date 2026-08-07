/**
 * ActivityView 2026-08-06 稽核回歸測試：
 *
 * 項目 1：LIFF「開始報名」對本學期已有報名的孩子必定 400（後端
 *   api/parent_portal/activity.py register_courses 的同 student+學期去重閘），
 *   而家長端沒有取消／改課入口 → 必須在開表單前就擋下，並給可行動的指示。
 * 項目 2：hero「進行中」原本算報名筆數（一孩一學期恆為 0 或 1），應改算佔位課程數。
 * 項目 3：「我的報名」分頁載入期間一片空白 → 補骨架與空狀態說明。
 *
 * fixture 形狀依後端 RegistrationSummaryOut / ParentCourseItemOut 造，
 * my-registrations 只回 is_active 的報名（後端已 filter），故清單中出現即代表
 * 去重閘會擋。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref, defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  register: vi.fn(),
  toastWarn: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn().mockResolvedValue({ data: { items: [] } }),
  myRegistrations: vi.fn().mockResolvedValue({ data: { items: [] } }),
  registerCourses: (...args: unknown[]) => mocks.register(...args),
  confirmPromotion: vi.fn().mockResolvedValue({ data: {} }),
  declinePromotion: vi.fn().mockResolvedValue({ data: {} }),
  getUpcomingSessions: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getActivityBootstrap: (...args: unknown[]) => mocks.bootstrap(...args),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warn: mocks.toastWarn,
    info: vi.fn(),
  },
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId: ref(1),
    ensureSelected: vi.fn(),
  }),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

const ActivityRegisterSheetStub = defineComponent({
  name: 'ActivityRegisterSheet',
  props: {
    modelValue: Boolean,
    formData: Object,
    children: Array,
    availableCourses: Array,
    conflictIds: [Object, Array],
    submitting: Boolean,
  },
  emits: ['update:modelValue', 'update:formData', 'submit'],
  template: '<div class="activity-register-sheet-stub" />',
})

const STUBS = {
  ActivityHero: true,
  ActivityCardList: true,
  ActivityRegisterSheet: ActivityRegisterSheetStub,
  RegistrationStatusList: true,
  ChildContextHeader: true,
  ParentIcon: true,
  ConfirmDialog: true,
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
}

/** 目錄課程（list_courses 只回開放中學期，本例 115 學年第 1 學期）。 */
function catalogCourse(id: number, name: string) {
  return {
    id,
    name,
    price: 3000,
    school_year: 115,
    semester: 1,
    capacity: 20,
    enrolled_count: 3,
    is_full: false,
    allow_waitlist: true,
    sessions: 16,
    meeting_weekdays: [1],
    meeting_start_time: '15:30',
    meeting_end_time: '16:30',
  }
}

function regCourse(courseId: number, name: string, status: string) {
  return {
    registration_course_id: courseId * 10,
    course_id: courseId,
    course_name: name,
    status,
    price_snapshot: 3000,
    promoted_at: null,
    confirm_deadline: null,
    meeting_weekdays: [1],
    meeting_weekday: 1,
    meeting_start_time: '15:30',
    meeting_end_time: '16:30',
  }
}

/** 家長端 my-registrations 的一列（後端只回 is_active=True）。 */
function registration(
  overrides: Partial<Record<string, unknown>> = {},
  courses: ReturnType<typeof regCourse>[] = [],
) {
  return {
    id: 501,
    student_id: 1,
    student_name: '小明',
    school_year: 115,
    semester: 1,
    is_paid: false,
    paid_amount: 0,
    total_amount: 3000,
    outstanding_amount: 3000,
    payment_status: 'unpaid',
    refunded_amount: 0,
    match_status: 'matched',
    pending_review: false,
    courses,
    ...overrides,
  }
}

function bootstrapPayload(opts: {
  courses?: unknown[]
  registrations?: unknown[]
}) {
  return {
    data: {
      courses: { items: opts.courses ?? [], total: (opts.courses ?? []).length },
      registrations: {
        items: opts.registrations ?? [],
        total: (opts.registrations ?? []).length,
      },
      upcoming_sessions: { items: [], total: 0 },
      registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
    },
  }
}

async function mountView() {
  setActivePinia(createPinia())
  const ActivityView = (await import('@/parent/views/ActivityView.vue')).default
  const w = mount(ActivityView, { global: { stubs: STUBS } })
  await flushPromises()
  return w
}

/** 切到「可報名課程」分頁並回傳「開始報名」按鈕。 */
async function gotoNewTab(w: VueWrapper) {
  const tabs = w.findAll('.m3-segment')
  await tabs[1].trigger('click')
  await flushPromises()
  return w.find('.toolbar .pt-action-btn')
}

beforeEach(() => {
  mocks.bootstrap.mockReset()
  mocks.register.mockReset()
  mocks.toastWarn.mockReset()
  mocks.toastError.mockReset()
  mocks.toastSuccess.mockReset()
})

describe('項目 1：本學期已有報名時的報名入口守衛', () => {
  it('已有本學期報名時，點「開始報名」不開啟報名表單', async () => {
    mocks.bootstrap.mockResolvedValue(
      bootstrapPayload({
        courses: [catalogCourse(11, '足球'), catalogCourse(12, '畫畫')],
        registrations: [registration({}, [regCourse(11, '足球', 'enrolled')])],
      }),
    )
    const w = await mountView()

    const btn = await gotoNewTab(w)
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()

    // 報名 sheet 不得開啟（開了也必定被後端 400 擋下，是死路）
    expect(
      w.findComponent({ name: 'ActivityRegisterSheet' }).props('modelValue'),
    ).toBe(false)

    // 改導向「我的報名」分頁：該分頁沒有 toolbar 的「開始報名」按鈕
    expect(w.find('.toolbar .pt-action-btn').exists()).toBe(false)

    // 提示必須是家長做得到的事，不可要求他「先取消既有報名」（家長端無此入口）
    expect(mocks.toastWarn).toHaveBeenCalled()
    const msg = String(mocks.toastWarn.mock.calls.at(-1)?.[0] ?? '')
    expect(msg).not.toContain('取消既有報名')
    expect(msg).toContain('洽校方')

    w.unmount()
  })

  it('只有前一學期的報名時，仍可正常開啟報名表單（守衛不得過度攔截）', async () => {
    mocks.bootstrap.mockResolvedValue(
      bootstrapPayload({
        courses: [catalogCourse(11, '足球')],
        registrations: [
          registration({ id: 401, school_year: 114, semester: 2 }, [
            regCourse(9, '舊學期陶土', 'enrolled'),
          ]),
        ],
      }),
    )
    const w = await mountView()

    const btn = await gotoNewTab(w)
    await btn.trigger('click')
    await flushPromises()

    expect(
      w.findComponent({ name: 'ActivityRegisterSheet' }).props('modelValue'),
    ).toBe(true)

    w.unmount()
  })

  it('競態下仍撞到後端 400 時，不把「請先取消既有報名」原樣轉述給家長', async () => {
    mocks.bootstrap.mockResolvedValue(
      bootstrapPayload({ courses: [catalogCourse(11, '足球')], registrations: [] }),
    )
    // 後端 register_courses 的原文（HTTPException detail → axios wrapper 的 displayMessage）
    mocks.register.mockRejectedValue({
      displayMessage: '該學期已有活的報名，請先取消既有報名再重新提交',
    })
    const w = await mountView()

    const vm = w.vm as unknown as {
      form: { student_id?: number; course_ids?: number[] }
      submitRegister: () => Promise<void>
    }
    vm.form.student_id = 1
    vm.form.course_ids = [11]
    await vm.submitRegister()
    await flushPromises()

    const shown = [
      ...mocks.toastWarn.mock.calls,
      ...mocks.toastError.mock.calls,
    ].map((c) => String(c[0] ?? ''))
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.some((m) => m.includes('取消既有報名'))).toBe(false)
    expect(shown.some((m) => m.includes('洽校方'))).toBe(true)

    w.unmount()
  })
})

describe('項目 2：hero「進行中」計佔位課程數', () => {
  it('同一筆報名含兩門佔位課程時顯示 2（而非報名筆數 1）', async () => {
    mocks.bootstrap.mockResolvedValue(
      bootstrapPayload({
        courses: [catalogCourse(11, '足球')],
        registrations: [
          registration({}, [
            regCourse(11, '足球', 'enrolled'),
            regCourse(12, '畫畫', 'enrolled'),
            regCourse(13, '街舞', 'waitlist'), // 候補不佔位，不計
          ]),
        ],
      }),
    )
    const w = await mountView()

    expect(
      w.findComponent({ name: 'ActivityHero' }).props('activeRegistrations'),
    ).toBe(2)

    w.unmount()
  })
})

describe('項目 3：「我的報名」分頁的載入中與空狀態', () => {
  it('載入中顯示骨架，不是一片空白', async () => {
    mocks.bootstrap.mockReturnValue(new Promise(() => {})) // 永遠 pending
    const w = await mountView()

    // 預設就停在「我的報名」分頁
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    // 載入中不得誤顯空狀態
    expect(w.text()).not.toContain('尚無報名')

    w.unmount()
  })

  it('載入完成且無報名時，空狀態帶下一步指引', async () => {
    mocks.bootstrap.mockResolvedValue(
      bootstrapPayload({ courses: [catalogCourse(11, '足球')], registrations: [] }),
    )
    const w = await mountView()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.text()).toContain('尚無報名')
    // 空狀態要告訴家長下一步怎麼做，不能只有「尚無報名」四個字
    const note = w.find('.pt-empty-note')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('報名')

    w.unmount()
  })
})
