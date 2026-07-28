/**
 * IepView —「複製上學期」回歸測試
 *
 * 原 bug：onClone 以 `ieps.find(i => i.student_id === selected.id)` 取來源，
 * 只抓得到該學生的「第一筆」IEP（順序由後端回傳決定），按鈕卻寫「複製上學期」。
 * 學生累積多學期後，複製到的是哪一份無法預期。
 *
 * 併驗學年預設：gov_moe 的 school_year 是西元學年，且須按台灣學制 8/1 起算。
 * 系統時間固定在 2026-07-28 → 當前應為 **2025 學年第 2 學期**（非 2026）。
 * 若預設值退回 `new Date().getFullYear()`，previousTerm 會算成 (2025, 2)，
 * 找不到來源而走 warning 分支，本測試即會紅。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { elMessage, elMessageBox } = vi.hoisted(() => ({
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  elMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
}))

vi.mock('element-plus', () => ({
  ElMessage: elMessage,
  ElMessageBox: elMessageBox,
}))

// 同一學生的兩份 IEP：舊的 2024 學年在前，前一學期（2025-1）在後。
// 舊實作取 find 的第一筆 → 會錯拿 id=100。
const IEP_ROWS = [
  { id: 100, student_id: 1, school_year: 2024, semester: 1, status: 'closed' },
  { id: 101, student_id: 1, school_year: 2025, semester: 1, status: 'approved' },
]

vi.mock('@/api/govMoe', () => ({
  listIeps: vi.fn(),
  createIep: vi.fn(),
  updateIep: vi.fn(),
  cloneIep: vi.fn(() => Promise.resolve({})),
  submitIep: vi.fn(),
  approveIep: vi.fn(),
  closeIep: vi.fn(),
  exportIepPdf: vi.fn(),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn(() =>
    Promise.resolve({
      data: {
        items: [{ id: 1, name: '王小明', classroom_id: 1, disability_type: '自閉症' }],
        total: 1,
        skip: 0,
        limit: 500,
      },
    }),
  ),
}))

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({
    classrooms: [{ id: 1, name: 'A 班' }],
    fetchClassrooms: vi.fn(() => Promise.resolve()),
  }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

import { listIeps, cloneIep } from '@/api/govMoe'
import IepView from '@/views/admin/gov-reports/IepView.vue'

const mountOptions = {
  global: {
    stubs: {
      PageHeader: { template: '<div><slot name="actions"/><slot name="filters"/></div>' },
      'el-select': { template: '<div><slot/></div>' },
      'el-option': { template: '<div/>' },
      'el-tag': { template: '<span><slot/></span>' },
      'el-button': {
        template: '<button :disabled="$attrs.disabled"><slot/></button>',
        inheritAttrs: true,
      },
      'el-tabs': { template: '<div><slot/></div>' },
      'el-tab-pane': { template: '<div><slot/></div>' },
      'el-form': { template: '<div><slot/></div>' },
      'el-form-item': { template: '<div><slot/></div>' },
      'el-input': { template: '<input/>' },
      'el-date-picker': { template: '<input/>' },
      'el-table': { template: '<div><slot/></div>' },
      'el-table-column': { template: '<div/>' },
    },
    directives: { loading: {} },
  },
}

async function mountAndSelectStudent() {
  const w = mount(IepView, mountOptions)
  await flushPromises()
  await w.find('.student-list li').trigger('click')
  await flushPromises()
  return w
}

const findButton = (w, label) =>
  w.findAll('button').find((b) => b.text().includes(label))

describe('IepView — 複製上學期', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 只 fake Date，不動 timers，否則 flushPromises 會卡住
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-28T10:00:00+08:00'))
    vi.mocked(listIeps).mockResolvedValue({ data: IEP_ROWS })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('複製的是前一學期那筆，不是該學生的第一筆', async () => {
    const w = await mountAndSelectStudent()

    await findButton(w, '複製上學期').trigger('click')
    await flushPromises()

    expect(cloneIep).toHaveBeenCalledTimes(1)
    // 2026-07 → 當前為 2025 學年第 2 學期（複製目標）；來源是前一期 2025-1 → id=101
    expect(cloneIep).toHaveBeenCalledWith(101, {
      target_school_year: 2025,
      target_semester: 2,
    })
    // 舊 bug 會拿到 2024 學年那筆
    expect(cloneIep).not.toHaveBeenCalledWith(100, expect.anything())
  })

  it('找不到前一學期的 IEP 時給明確訊息且不呼叫 API', async () => {
    // 只留 2024 學年那筆 → 前一期（2025-1）不存在
    vi.mocked(listIeps).mockResolvedValue({ data: [IEP_ROWS[0]] })
    const w = await mountAndSelectStudent()

    await findButton(w, '複製上學期').trigger('click')
    await flushPromises()

    expect(cloneIep).not.toHaveBeenCalled()
    expect(elMessage.warning).toHaveBeenCalledWith(
      expect.stringContaining('2025 學年第 1 學期'),
    )
  })

  it('載入失敗時顯示錯誤訊息，不再靜默留白', async () => {
    vi.mocked(listIeps).mockRejectedValue({ response: { status: 500 } })
    mount(IepView, mountOptions)
    await flushPromises()

    expect(elMessage.error).toHaveBeenCalled()
  })
})
