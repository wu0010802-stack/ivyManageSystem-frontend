// Low（2026-06-24 code review）：家長報名 / 候補轉正成功後，只刷新 fetchMy + fetchCourses，
// 漏刷 upcoming-sessions → hero 的「即將開課」與下次上課時間不更新（剛報名/轉正的課
// 不會出現在即將開課）。本測試鎖定：兩條成功路徑都必須一併刷新 upcoming sessions。
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  myRegistrations: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  registerCourses: vi.fn(),
  confirmPromotion: vi.fn(() => Promise.resolve({ data: { status: 'ok' } })),
  declinePromotion: vi.fn(() => Promise.resolve({ data: { status: 'declined' } })),
  getRegistrationTime: vi.fn(() => Promise.resolve({ data: { open_at: null, close_at: '2999-01-01T00:00:00Z' } })),
  getUpcomingSessions: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  getActivityBootstrap: vi.fn(() =>
    Promise.resolve({
      data: {
        registrations: { items: [] },
        courses: { items: [] },
        upcoming_sessions: { items: [] },
        registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
      },
    }),
  ),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '阿活' }],
    load: vi.fn(() => Promise.resolve()),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))

import {
  registerCourses,
  confirmPromotion,
  declinePromotion,
  getActivityBootstrap,
  getUpcomingSessions,
  listCourses,
  myRegistrations,
} from '@/parent/api/activity'
import { toast } from '@/parent/utils/toast'
import ActivityView from '@/parent/views/ActivityView.vue'

function mountView() {
  return mount(ActivityView, {
    attachTo: document.body,
    global: {
      stubs: {
        PullToRefresh: { template: '<div><slot /></div>' },
        ActivityHero: true,
        ChildContextHeader: true,
        ActivityCardList: true,
        ActivityRegisterSheet: true,
        RegistrationStatusList: true,
        ParentIcon: true,
      },
    },
  })
}

describe('ActivityView 報名/轉正後刷新 upcoming sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('報名成功後刷新 upcoming sessions（hero 即將開課）', async () => {
    registerCourses.mockResolvedValueOnce({ data: { id: 1, courses: [] } })
    const w = mountView()
    await flushPromises()
    getUpcomingSessions.mockClear() // 排除 mount 期間呼叫，只看報名後

    w.vm.form.student_id = 1
    w.vm.form.course_ids = [10]
    await w.vm.submitRegister()
    await flushPromises()

    expect(getUpcomingSessions).toHaveBeenCalled()
    w.unmount()
  })

  it('候補轉正確認成功後刷新 upcoming sessions', async () => {
    const w = mountView()
    await flushPromises()
    getUpcomingSessions.mockClear()

    await w.vm.onConfirmPromotion({ id: 5, courses: [] }, { course_id: 10 })
    await flushPromises()

    expect(confirmPromotion).toHaveBeenCalledWith(5, 10)
    expect(getUpcomingSessions).toHaveBeenCalled()
    w.unmount()
  })

  it('放棄候補遞補成功後刷新報名、課程容量與 upcoming sessions', async () => {
    const w = mountView()
    await flushPromises()
    getUpcomingSessions.mockClear()

    // 設計審查 2026-07-28：放棄改走 ConfirmDialog 兩段式（開 dialog → confirm）
    w.vm.onDeclinePromotion({ id: 5, courses: [] }, { course_id: 10 })
    await w.vm.onDeclineConfirmed()
    await flushPromises()

    expect(declinePromotion).toHaveBeenCalledWith(5, 10)
    expect(myRegistrations).toHaveBeenCalled()
    expect(getUpcomingSessions).toHaveBeenCalled()
    expect(w.vm.confirmingKey).toBe(null)
    w.unmount()
  })

  // Low（2026-06-29 稽核 finding 4）：onConfirmPromotion 的 finally 在未 await 的
  // Promise.all 刷新前就清 confirmingKey → 慢網路下舊「確認」按鈕提早恢復，
  // 二次點擊命中已轉正的課程得到 409。修法：await 刷新後再解鎖。
  it('轉正確認：刷新完成前 confirmingKey 不解鎖（消除重複送出窗口）', async () => {
    // 讓 fetchMy 的 myRegistrations 維持 pending，模擬慢網路刷新
    let resolveMy
    myRegistrations.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveMy = r
        }),
    )

    const w = mountView()
    await flushPromises()

    // 啟動轉正確認（不 await，刷新階段 myRegistrations 仍 pending）
    const p = w.vm.onConfirmPromotion({ id: 5, courses: [] }, { course_id: 10 })
    await flushPromises()

    // 刷新尚未完成 → confirmingKey 必須仍鎖住（修前：finally 已提早清成 null）
    expect(w.vm.confirmingKey).toBe('5:10')

    // 解開刷新 → Promise.all 完成 → onConfirmPromotion resolve
    resolveMy({ data: { items: [], total: 0 } })
    await p
    await flushPromises()

    // 刷新完成後才解鎖
    expect(w.vm.confirmingKey).toBe(null)
    w.unmount()
  })

  it('舊 bootstrap 晚回時，不得覆寫轉正後局部刷新取得的新快照', async () => {
    let resolveBootstrap
    getActivityBootstrap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve
        }),
    )

    const w = mountView()
    await flushPromises()

    const newReg = {
      id: 21,
      student_id: 1,
      school_year: 114,
      semester: 2,
      is_paid: false,
      courses: [{ course_id: 10, course_name: '美術', status: 'enrolled' }],
    }
    myRegistrations.mockResolvedValueOnce({ data: { items: [newReg], total: 1 } })
    listCourses.mockResolvedValueOnce({
      data: { items: [{ id: 10, name: '美術', school_year: 114, semester: 2 }] },
    })
    getUpcomingSessions.mockResolvedValueOnce({ data: { items: [] } })

    await w.vm.onConfirmPromotion(
      { id: 21, courses: [] },
      { course_id: 10, course_name: '美術' },
    )
    expect(w.vm.myRegs).toEqual([newReg])

    resolveBootstrap({
      data: {
        registrations: {
          items: [{
            ...newReg,
            courses: [{ course_id: 10, course_name: '美術', status: 'promoted_pending' }],
          }],
        },
        courses: { items: [] },
        upcoming_sessions: { items: [] },
        registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
      },
    })
    await flushPromises()

    expect(w.vm.myRegs).toEqual([newReg])
    w.unmount()
  })

  it('局部刷新任一 API 失敗時保留整份舊快照，不留下新報名搭配舊容量', async () => {
    const oldReg = {
      id: 40,
      student_id: 1,
      school_year: 114,
      semester: 2,
      is_paid: false,
      courses: [{ course_id: 10, course_name: '美術', status: 'promoted_pending' }],
    }
    const oldCourse = {
      id: 10,
      name: '美術',
      school_year: 114,
      semester: 2,
      capacity: 1,
      enrolled_count: 0,
      is_full: false,
      allow_waitlist: true,
    }
    getActivityBootstrap.mockResolvedValueOnce({
      data: {
        registrations: { items: [oldReg] },
        courses: { items: [oldCourse] },
        upcoming_sessions: { items: [] },
        registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
      },
    })
    const w = mountView()
    await flushPromises()

    const newReg = {
      ...oldReg,
      courses: [{ course_id: 10, course_name: '美術', status: 'enrolled' }],
    }
    myRegistrations.mockResolvedValueOnce({ data: { items: [newReg], total: 1 } })
    listCourses.mockRejectedValueOnce(new Error('course refresh failed'))

    await w.vm.onConfirmPromotion(oldReg, oldReg.courses[0])
    await flushPromises()

    expect(w.vm.myRegs).toEqual([oldReg])
    expect(w.vm.courses).toEqual([oldCourse])
    expect(w.vm.regsLoading).toBe(false)
    expect(w.vm.coursesLoading).toBe(false)
    expect(w.vm.confirmingKey).toBe(null)
    expect(toast.error).toHaveBeenCalledWith('重新整理才藝資料失敗')
    w.unmount()
  })

  it('報名 Promise 會等局部刷新完成才結束並解除 submitting', async () => {
    let resolveMy
    myRegistrations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMy = resolve
        }),
    )
    registerCourses.mockResolvedValueOnce({ data: { id: 31, courses: [] } })

    const w = mountView()
    await flushPromises()
    w.vm.form.student_id = 1
    w.vm.form.school_year = 114
    w.vm.form.semester = '2'
    w.vm.form.course_ids = [10]

    const saving = w.vm.submitRegister()
    await flushPromises()
    expect(w.vm.submitting).toBe(true)

    resolveMy({ data: { items: [], total: 0 } })
    await saving
    expect(w.vm.submitting).toBe(false)
    w.unmount()
  })
})

// ── 盲區稽核 C4（2026-07-31）：確認/放棄失敗時也必須刷新 ─────────────────────
// 原本只有成功路徑 await refreshActivitySnapshot()，catch 只 toast。家長按下逾期的
// 「確認轉正式」拿到 410 後，該列與按鈕仍留在畫面上（伺服器端該列已被
// release_expired_pending_promotion 刪除），再按一次變成 404；首頁徽章又有 60s TTL
// 快取，同時段也還在顯示。錯誤路徑重抓才能讓畫面收斂到伺服器真實狀態。
describe('ActivityView 候補操作失敗後仍需刷新快照', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('確認轉正失敗（例如 410 已逾期）後重抓報名清單', async () => {
    const w = mountView()
    await flushPromises()
    myRegistrations.mockClear()
    getActivityBootstrap.mockClear()

    confirmPromotion.mockRejectedValueOnce({ displayMessage: '確認期限已過' })
    await w.vm.onConfirmPromotion({ id: 5, courses: [] }, { course_id: 10 })
    await flushPromises()

    expect(toast.error).toHaveBeenCalled()
    expect(myRegistrations).toHaveBeenCalled()
    expect(w.vm.confirmingKey).toBe(null)
    w.unmount()
  })

  it('放棄候補失敗後重抓報名清單', async () => {
    const w = mountView()
    await flushPromises()
    myRegistrations.mockClear()

    declinePromotion.mockRejectedValueOnce({ displayMessage: '此課程已是正式報名' })
    w.vm.onDeclinePromotion({ id: 5, courses: [] }, { course_id: 10 })
    await w.vm.onDeclineConfirmed()
    await flushPromises()

    expect(toast.error).toHaveBeenCalled()
    expect(myRegistrations).toHaveBeenCalled()
    expect(w.vm.confirmingKey).toBe(null)
    w.unmount()
  })
})
