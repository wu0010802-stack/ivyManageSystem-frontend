import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 課程繳費單批次列印（A4 八格 + QR）：dialog 開啟預設期限、確認後帶
// course_id + due_date 呼 API 並經 openPdfInNewTab 開分頁；後端 404
// （無未結清）的 Blob error body 要解出 detail 顯示，且 dialog 保留供重試。

const getCoursesMock = vi.hoisted(() => vi.fn())
const getCoursePaymentSlipsPdfMock = vi.hoisted(() => vi.fn())
const openPdfInNewTabMock = vi.hoisted(() => vi.fn())
const messageErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getCourses: getCoursesMock,
  getCoursePaymentSlipsPdf: getCoursePaymentSlipsPdfMock,
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  sweepExpiredWaitlist: vi.fn(),
}))
vi.mock('@/utils/printPdfWindow', () => ({ openPdfInNewTab: openPdfInNewTabMock }))
vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: messageErrorMock, warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import ActivityCourseView from '../ActivityCourseView.vue'

const STUBS = {
  'el-drawer': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-empty': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-switch': { template: '<div />' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-time-picker': { template: '<input />' },
  'el-date-picker': { template: '<input />' },
  'el-alert': { template: '<div><slot /></div>' },
  AcademicTermSelector: { template: '<div />' },
}

type SlipVm = {
  openSlipDialog: (row: { id: number; name: string }) => void
  handlePrintSlips: () => Promise<void>
  slipDialogVisible: boolean
  slipDueDate: string
  slipPrinting: boolean
}

function setupState(wrapper: ReturnType<typeof mount>): SlipVm {
  return (wrapper.vm.$ as unknown as { setupState: SlipVm }).setupState
}

async function mountView() {
  const wrapper = mount(ActivityCourseView, { global: { stubs: STUBS } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  getCoursesMock.mockResolvedValue({ data: { courses: [] } })
})

describe('ActivityCourseView 繳費單批次列印', () => {
  it('開啟 dialog 預設繳費期限為今天 +14 天', async () => {
    const wrapper = await mountView()
    const vm = setupState(wrapper)

    vm.openSlipDialog({ id: 7, name: '直笛課' })

    expect(vm.slipDialogVisible).toBe(true)
    const expected = new Date()
    expected.setDate(expected.getDate() + 14)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(vm.slipDueDate).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`
    )
  })

  it('列印成功：帶 course_id 與期限呼叫 API、關閉 dialog', async () => {
    // 抄真實契約：openPdfInNewTab 會呼叫 fetchBlob，成功回傳 win 物件
    openPdfInNewTabMock.mockImplementation(
      async ({ fetchBlob }: { fetchBlob: () => Promise<Blob> }) => {
        await fetchBlob()
        return {} as Window
      }
    )
    getCoursePaymentSlipsPdfMock.mockResolvedValue({ data: new Blob(['%PDF']) })
    const wrapper = await mountView()
    const vm = setupState(wrapper)
    vm.openSlipDialog({ id: 7, name: '直笛課' })
    vm.slipDueDate = '2026-09-15'

    await vm.handlePrintSlips()
    await flushPromises()

    expect(getCoursePaymentSlipsPdfMock).toHaveBeenCalledWith(7, '2026-09-15')
    expect(vm.slipDialogVisible).toBe(false)
    expect(vm.slipPrinting).toBe(false)
  })

  it('後端 404（無未結清）：解出 Blob error body 的 detail 顯示，dialog 保留', async () => {
    // 抄真實契約：fetchBlob 拋錯時 openPdfInNewTab 吞錯呼叫 onError 並回 null
    openPdfInNewTabMock.mockImplementation(
      async ({
        fetchBlob,
        onError,
      }: {
        fetchBlob: () => Promise<Blob>
        onError: (err: unknown) => void
      }) => {
        try {
          await fetchBlob()
        } catch (err) {
          onError(err)
          return null
        }
        return {} as Window
      }
    )
    getCoursePaymentSlipsPdfMock.mockRejectedValue({
      response: {
        data: new Blob([JSON.stringify({ detail: '該課程目前沒有未結清的報名，無繳費單可列印' })]),
      },
    })
    const wrapper = await mountView()
    const vm = setupState(wrapper)
    vm.openSlipDialog({ id: 7, name: '直笛課' })

    await vm.handlePrintSlips()
    await flushPromises()
    await flushPromises() // blob.text() 為額外一輪 microtask

    expect(messageErrorMock).toHaveBeenCalledWith('該課程目前沒有未結清的報名，無繳費單可列印')
    expect(vm.slipDialogVisible).toBe(true)
    expect(vm.slipPrinting).toBe(false)
  })
})
