import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import CertificateBatchDialog from '@/components/gov-reports/CertificateBatchDialog.vue'

const { mockGetClassrooms, mockGetStudents, mockBatchGenerate } = vi.hoisted(() => ({
  mockGetClassrooms: vi.fn(),
  mockGetStudents: vi.fn(),
  mockBatchGenerate: vi.fn(),
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...args: unknown[]) => mockGetClassrooms(...args),
}))
vi.mock('@/api/students', () => ({
  getStudents: (...args: unknown[]) => mockGetStudents(...args),
}))
vi.mock('@/api/govMoe', () => ({
  batchGenerateCertificates: (...args: unknown[]) => mockBatchGenerate(...args),
}))

interface StudentRow {
  id: number
  name: string
  selected: boolean
}

interface DialogVm {
  classroomId: number | null
  classroomOptions: { id: number; name: string }[]
  rows: StudentRow[]
  form: { issue_date: string; purpose: string; copies: number }
  resultSummary: { succeeded: number; failed: number; items: unknown[] } | null
  allSelected: boolean
  selectedCount: number
  submit: () => Promise<void>
}

function mountDialog() {
  return mount(CertificateBatchDialog, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}
const vmOf = (w: ReturnType<typeof mountDialog>) => w.vm as unknown as DialogVm

describe('CertificateBatchDialog', () => {
  let successSpy: ReturnType<typeof vi.spyOn>
  let warningSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockGetClassrooms.mockReset().mockResolvedValue({
      data: [
        { id: 1, name: '小班A' },
        { id: 2, name: '中班A' },
      ],
    })
    mockGetStudents.mockReset().mockResolvedValue({
      data: {
        items: [
          { id: 11, name: '小明' },
          { id: 12, name: '小美' },
        ],
      },
    })
    mockBatchGenerate.mockReset()

    successSpy = vi.spyOn(ElMessage, 'success')
    warningSpy = vi.spyOn(ElMessage, 'warning')
    errorSpy = vi.spyOn(ElMessage, 'error')

    // jsdom 未實作 createObjectURL；批次下載 PDF 需要
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    successSpy.mockRestore()
    warningSpy.mockRestore()
    errorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('開啟時載入班級選項', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(mockGetClassrooms).toHaveBeenCalledTimes(1)
    expect(vmOf(wrapper).classroomOptions).toEqual([
      { id: 1, name: '小班A' },
      { id: 2, name: '中班A' },
    ])
  })

  it('選擇班級後載入在籍學生，預設全選', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    vmOf(wrapper).classroomId = 1
    await flushPromises()

    expect(mockGetStudents).toHaveBeenCalledWith({ classroom_id: 1, is_active: true, limit: 500 })
    const vm = vmOf(wrapper)
    expect(vm.rows).toHaveLength(2)
    expect(vm.rows.every((r) => r.selected)).toBe(true)
    expect(vm.selectedCount).toBe(2)
  })

  it('allSelected 可整批取消勾選', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()

    vm.allSelected = false
    expect(vm.rows.every((r) => !r.selected)).toBe(true)
    expect(vm.selectedCount).toBe(0)
  })

  it('未填申請用途送出 → warning 提示，不呼叫 API', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = ''

    await vm.submit()
    expect(warningSpy).toHaveBeenCalledWith('請填寫申請用途')
    expect(mockBatchGenerate).not.toHaveBeenCalled()
  })

  it('未勾選任何學生送出 → warning「請至少選擇一位學生」', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '入學申請'
    vm.allSelected = false

    await vm.submit()
    expect(warningSpy).toHaveBeenCalledWith('請至少選擇一位學生')
    expect(mockBatchGenerate).not.toHaveBeenCalled()
  })

  it('勾選超過 60 位送出 → warning「最多 60 位」，不呼叫 API', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '入學申請'
    // 灌爆到 61 筆
    vm.rows = Array.from({ length: 61 }, (_, i) => ({ id: i + 1, name: `生${i}`, selected: true }))

    await vm.submit()
    expect(warningSpy).toHaveBeenCalledWith('最多 60 位，請分批送出')
    expect(mockBatchGenerate).not.toHaveBeenCalled()
  })

  it('全成功：呼叫 API 帶正確 payload、成功訊息、下載 PDF、關閉並 emit generated', async () => {
    mockBatchGenerate.mockResolvedValue({
      data: {
        results: [
          { student_id: 11, ok: true, serial: 'EC-2026-0001' },
          { student_id: 12, ok: true, serial: 'EC-2026-0002' },
        ],
        succeeded: 2,
        failed: 0,
        pdf_base64: btoa('fake-pdf-bytes'),
      },
    })

    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '入學申請'
    vm.form.issue_date = '2026-08-23'

    await vm.submit()
    await flushPromises()

    expect(mockBatchGenerate).toHaveBeenCalledWith({
      student_ids: [11, 12],
      issue_date: '2026-08-23',
      purpose: '入學申請',
      copies: 1,
    })
    expect(successSpy).toHaveBeenCalledWith('已成功開立 2 份在學證明')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.emitted('generated')).toBeTruthy()
  })

  it('部分成功：resultSummary 記錄失敗清單、warning 提示、不自動關閉，仍 emit generated', async () => {
    mockBatchGenerate.mockResolvedValue({
      data: {
        results: [
          { student_id: 11, ok: true, serial: 'EC-2026-0001' },
          { student_id: 12, ok: false, error: '學生非在籍狀態' },
        ],
        succeeded: 1,
        failed: 1,
        pdf_base64: btoa('fake-pdf-bytes'),
      },
    })

    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '入學申請'

    await vm.submit()
    await flushPromises()

    expect(warningSpy).toHaveBeenCalledWith('部分成功：成功 1 份，失敗 1 份')
    expect(vm.resultSummary).toMatchObject({ succeeded: 1, failed: 1 })
    expect(vm.resultSummary?.items).toContainEqual(
      expect.objectContaining({ student_id: 12, name: '小美', ok: false, error: '學生非在籍狀態' }),
    )
    // 部分成功不自動關閉，讓使用者看失敗清單
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    expect(wrapper.emitted('generated')).toBeTruthy()
  })

  it('全失敗：不下載 PDF（pdf_base64=null）、不 emit generated', async () => {
    mockBatchGenerate.mockResolvedValue({
      data: {
        results: [
          { student_id: 11, ok: false, error: '學生不存在' },
          { student_id: 12, ok: false, error: '學生非在籍狀態' },
        ],
        succeeded: 0,
        failed: 2,
        pdf_base64: null,
      },
    })

    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '入學申請'

    await vm.submit()
    await flushPromises()

    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(wrapper.emitted('generated')).toBeFalsy()
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('API 拋錯（如驗證失敗）→ ElMessage.error 顯示', async () => {
    mockBatchGenerate.mockRejectedValue({
      response: { status: 422, data: { detail: '不合法的請求' } },
    })

    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '入學申請'

    await vm.submit()
    await flushPromises()

    expect(errorSpy).toHaveBeenCalledWith('不合法的請求')
  })

  it('重新開啟對話框會重置表單與選取狀態', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.classroomId = 1
    await flushPromises()
    vm.form.purpose = '殘留內容'

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(vmOf(wrapper).form.purpose).toBe('')
    expect(vmOf(wrapper).classroomId).toBeNull()
    expect(vmOf(wrapper).rows).toEqual([])
  })
})
