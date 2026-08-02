import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// review P1（2026-07-12）：候補 Drawer 的 openWaitlist / openEnrolled 無請求序號守衛
//（fetchCourses 有 fetchSeq，這兩支沒有）。快速切換不同課程的候補名單時，較慢的舊課
// 回應可最後覆寫較新課程的清單 → Drawer 標題顯示新課、列卻屬舊課。此時 confirmPromote
// 以最新 waitlistCourse.id 送出，但列的 registration_id 屬舊課；若同一報名同時候補兩課，
// 後端 (registration_id, course_id) pair 恰為合法 → 對「錯誤課程」升為正式並加費。
// 另一成因：el-drawer destroy-on-close 只拆 modal DOM、不清 promoteDialog 狀態，換課
// 重開 Drawer 會帶著舊課 registration 重現升位框。
// 修正：openWaitlist/openEnrolled 加 seq 守衛；openWaitlist 切課時 cancelPromote()。

const getCoursesMock = vi.hoisted(() => vi.fn())
const getCourseWaitlistMock = vi.hoisted(() => vi.fn())
const getCourseEnrolledMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getCourses: getCoursesMock,
  getCourseWaitlist: getCourseWaitlistMock,
  getCourseEnrolled: getCourseEnrolledMock,
  promoteWaitlist: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
}))
vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// vuedraggable stub：本測不驗拖拉，僅避免 jsdom 下掛真 Sortable
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'group', 'disabled', 'animation', 'ghostClass'],
    emits: ['update:modelValue', 'end'],
    template: `<div><template v-for="(el, i) in modelValue" :key="i"><slot name="item" :element="el" :index="i" /></template></div>`,
  },
}))

import ActivityCourseView from '../ActivityCourseView.vue'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const STUBS = {
  'el-drawer': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  // 本測以 setupState 直接驅動 openWaitlist/openEnrolled，不需渲染表列；column 不渲染
  // scoped default slot 以免 row 為 undefined（row.price 等）觸發 render 錯誤。
  'el-table-column': { template: '<div />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-empty': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span />' },
  'el-alert': { template: '<div />' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-switch': { template: '<input type="checkbox" />' },
  'el-time-picker': { template: '<input />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio': { template: '<label><slot /></label>' },
  'el-divider': { template: '<hr />' },
  AcademicTermSelector: true,
}

const baseCourse = {
  price: 3000, sessions: 10, capacity: 20, enrolled: 5, promoted_pending: 0,
  allow_waitlist: true, video_url: '', description: '',
  meeting_weekdays: null, meeting_start_time: '', meeting_end_time: '',
}
const courseA = { ...baseCourse, id: 1, name: 'A 課', waitlist_count: 1 }
const courseB = { ...baseCourse, id: 2, name: 'B 課', waitlist_count: 1 }

interface SetupState {
  openWaitlist: (row: unknown) => Promise<void>
  openEnrolled: (row: unknown) => Promise<void>
  openPromoteDialog: (reg: unknown) => void
  waitlistItems: { registration_id: number }[]
  waitlistCourse: { id: number; name: string } | null
  occupyingItems: { position?: number }[]
  queueItems: { position?: number }[]
  enrolledCourse: { id: number; name: string } | null
  promoteDialog: { open: boolean; registration: unknown }
}

async function mountView() {
  getCoursesMock.mockResolvedValue({ data: { courses: [courseA, courseB] } })
  const wrapper = mount(ActivityCourseView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  return wrapper
}

describe('ActivityCourseView 候補/報名 Drawer 請求序號守衛（review P1）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('舊課候補回應不覆寫新課 Drawer：較慢的 A 課回應 resolve 後清單仍屬 B 課', async () => {
    const dA = deferred<unknown>()
    const dB = deferred<unknown>()
    getCourseWaitlistMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise)

    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    ss.openWaitlist(courseA) // seq1，waitlistCourse=A，fetch A（pending）
    ss.openWaitlist(courseB) // seq2，waitlistCourse=B，fetch B（pending）

    dB.resolve({ data: { items: [{ registration_id: 200, student_name: 'B 生' }] } })
    await flushPromises()
    dA.resolve({ data: { items: [{ registration_id: 100, student_name: 'A 生' }] } }) // 遲到
    await flushPromises()

    expect(ss.waitlistCourse?.id).toBe(2)
    expect(ss.waitlistItems.length).toBe(1)
    expect(ss.waitlistItems[0].registration_id).toBe(200) // B 課的列，非 A 課的 100
    wrapper.unmount()
  })

  it('切換課程時重置殘留的手動升位確認框（避免帶舊課 registration 對新課升位）', async () => {
    getCourseWaitlistMock.mockResolvedValue({
      data: { items: [{ registration_id: 100, student_name: 'A 生' }] },
    })
    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    await ss.openWaitlist(courseA)
    await flushPromises()
    ss.openPromoteDialog(ss.waitlistItems[0])
    expect(ss.promoteDialog.open).toBe(true)

    await ss.openWaitlist(courseB) // 切課應重置升位框
    await flushPromises()
    expect(ss.promoteDialog.open).toBe(false)
    expect(ss.promoteDialog.registration).toBe(null)
    wrapper.unmount()
  })

  it('報名名單 Drawer 同守衛：較慢的 A 課回應不覆寫 B 課', async () => {
    const dA = deferred<unknown>()
    const dB = deferred<unknown>()
    getCourseEnrolledMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise)

    const wrapper = await mountView()
    const ss = wrapper.vm.$.setupState as SetupState

    ss.openEnrolled(courseA)
    ss.openEnrolled(courseB)

    dB.resolve({ data: { items: [{ position: 1, student_name: 'B 生', status: 'enrolled' }] } })
    await flushPromises()
    dA.resolve({
      data: {
        items: [
          { position: 1, student_name: 'A 生', status: 'enrolled' },
          { position: 2, status: 'enrolled' },
        ],
      },
    })
    await flushPromises()

    expect(ss.enrolledCourse?.id).toBe(2)
    expect(ss.occupyingItems.length).toBe(1) // B 課只有 1 筆，非 A 課的 2 筆
    wrapper.unmount()
  })
})
