import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/signDocuments', () => ({
  listSignTemplates: vi.fn(),
  listSignRequests: vi.fn(),
  createSignBatch: vi.fn(),
  voidSignRequest: vi.fn(),
  resendSignNotification: vi.fn(),
  signRequestPdfUrl: (id: number) => `http://test/api/sign-documents/requests/${id}/pdf`,
}))
vi.mock('@/api/classrooms', () => ({ getClassrooms: vi.fn() }))
vi.mock('@/api/students', () => ({ getStudents: vi.fn() }))

import {
  listSignTemplates,
  listSignRequests,
  createSignBatch,
  voidSignRequest,
  resendSignNotification,
} from '@/api/signDocuments'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import TrackingPanel from '../TrackingPanel.vue'

const mockListTemplates = listSignTemplates as ReturnType<typeof vi.fn>
const mockListRequests = listSignRequests as ReturnType<typeof vi.fn>
const mockCreateBatch = createSignBatch as ReturnType<typeof vi.fn>
const mockVoid = voidSignRequest as ReturnType<typeof vi.fn>
const mockResend = resendSignNotification as ReturnType<typeof vi.fn>
const mockGetClassrooms = getClassrooms as ReturnType<typeof vi.fn>
const mockGetStudents = getStudents as ReturnType<typeof vi.fn>

const windowOpenSpy = vi.fn()

let activeWrapper: VueWrapper | null = null
function mountPanel(canWrite = true) {
  activeWrapper = mount(TrackingPanel, {
    props: { canWrite },
    global: { plugins: [ElementPlus] },
  })
  return activeWrapper
}

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50))
  activeWrapper?.unmount()
  activeWrapper = null
})

const sampleRequest = {
  id: 1,
  student_id: 10,
  student_name: '王小明',
  title: '入學契約',
  status: 'pending',
  sent_at: '2026-08-11T10:00:00',
  signed_at: null,
}

describe('TrackingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.open = windowOpenSpy
    mockListRequests.mockResolvedValue({ data: [sampleRequest] })
    mockListTemplates.mockResolvedValue({
      data: [{ id: 1, title: '入學契約', doc_type: 'contract', is_active: true }],
    })
    mockGetClassrooms.mockResolvedValue({ data: [{ id: 5, name: '向日葵班' }] })
    mockGetStudents.mockResolvedValue({
      data: { items: [{ id: 10, name: '王小明' }, { id: 11, name: '李小華' }], limit: 500, skip: 0, total: 2 },
    })
  })

  it('掛載時載入追蹤列表', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(mockListRequests).toHaveBeenCalledWith({})
    expect(w.text()).toContain('王小明')
    expect(w.text()).toContain('入學契約')
  })

  it('已簽文件顯示「看 PDF」，pending 不顯示', async () => {
    mockListRequests.mockResolvedValue({
      data: [
        { ...sampleRequest, id: 2, status: 'signed', signed_at: '2026-08-11T11:00:00' },
        sampleRequest,
      ],
    })
    const w = mountPanel()
    await flushPromises()
    const pdfButtons = w.findAllComponents({ name: 'ElButton' }).filter((b) => b.text() === '看 PDF')
    expect(pdfButtons).toHaveLength(1)
  })

  it('canWrite=false 不顯示催簽/作廢/發送文件按鈕', async () => {
    const w = mountPanel(false)
    await flushPromises()
    expect(
      w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '催簽'),
    ).toBeUndefined()
    expect(
      w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '作廢'),
    ).toBeUndefined()
    expect(
      w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '發送文件'),
    ).toBeUndefined()
  })

  it('催簽按鈕呼叫 resendSignNotification', async () => {
    mockResend.mockResolvedValue({ data: { notified: 1 } })
    const w = mountPanel(true)
    await flushPromises()
    const resendBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '催簽')
    await resendBtn!.trigger('click')
    await flushPromises()
    expect(mockResend).toHaveBeenCalledWith(1)
  })

  it('作廢流程：輸入原因後呼叫 voidSignRequest', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '重複發送' } as never)
    mockVoid.mockResolvedValue({ data: {} })
    const w = mountPanel(true)
    await flushPromises()
    const voidBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '作廢')
    await voidBtn!.trigger('click')
    await flushPromises()
    expect(mockVoid).toHaveBeenCalledWith(1, { reason: '重複發送' })
  })

  it('作廢流程：取消 prompt 不呼叫 API', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue('cancel')
    const w = mountPanel(true)
    await flushPromises()
    const voidBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '作廢')
    await voidBtn!.trigger('click')
    await flushPromises()
    expect(mockVoid).not.toHaveBeenCalled()
  })

  it('發送精靈：選班級載入學生並預設全選，選文件後送出呼叫 createSignBatch', async () => {
    mockCreateBatch.mockResolvedValue({
      data: { created: 2, batch_id: 'b1', skipped: [], unnotifiable_student_ids: [] },
    })
    const w = mountPanel(true)
    await flushPromises()

    const dispatchBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '發送文件')
    await dispatchBtn!.trigger('click')
    await flushPromises()

    // Step 1：選班級 → 學生自動全選
    const dialog = w.findComponent({ name: 'ElDialog' })
    const classroomSelect = dialog.findComponent({ name: 'ElSelect' })
    await classroomSelect.vm.$emit('update:modelValue', 5)
    await classroomSelect.vm.$emit('change', 5)
    await flushPromises()

    let nextBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '下一步')
    await nextBtn!.trigger('click')
    await flushPromises()

    // Step 2：選文件
    const templateCheckbox = w.findComponent({ name: 'ElCheckboxGroup' })
    await templateCheckbox.vm.$emit('update:modelValue', [1])
    await flushPromises()

    nextBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '下一步')
    await nextBtn!.trigger('click')
    await flushPromises()

    // Step 3：確認送出
    const submitBtn = w.findAllComponents({ name: 'ElButton' }).find((b) => b.text() === '確認送出')
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockCreateBatch).toHaveBeenCalledWith({
      student_ids: [10, 11],
      template_ids: [1],
    })
  })

  it('filter 變更時帶對應參數重新載入', async () => {
    const w = mountPanel(true)
    await flushPromises()
    const statusSelect = w.findComponent({ name: 'ElSelect' })
    await statusSelect.vm.$emit('update:modelValue', 'signed')
    await statusSelect.vm.$emit('change', 'signed')
    await flushPromises()
    expect(mockListRequests).toHaveBeenLastCalledWith({ status: 'signed' })
  })
})
