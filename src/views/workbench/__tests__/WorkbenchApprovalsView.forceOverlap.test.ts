/**
 * F74：工作台簽核頁的請假核准（含「核准整張」）遇到「與已核准假單重疊」(409) 時，
 * 同樣要接到強制核准確認對話框；加班核准不受影響。
 * 走真的 useApprovalOperation，只 mock API 層。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  paged: <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 5000, hasMore: false }),
  approveLeave: vi.fn(),
  approveOvertime: vi.fn(),
  hasPermission: vi.fn(),
}))

import { defineComponent, h as vh } from 'vue'
import { shallowMount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }) }))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ confirmDiscardChanges: vi.fn().mockResolvedValue(true) }))

vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn().mockResolvedValue(h.paged([])),
  approveLeave: h.approveLeave,
  getLeaveAttachment: vi.fn(),
  batchApproveLeaves: vi.fn(),
}))
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn().mockResolvedValue(h.paged([])),
  approveOvertime: h.approveOvertime,
  batchApproveOvertimes: vi.fn(),
}))
vi.mock('@/api/punchCorrections', () => ({
  getCorrections: vi.fn().mockResolvedValue(h.paged([])),
  approveCorrection: vi.fn(),
  batchApproveCorrections: vi.fn(),
}))
vi.mock('@/api/approvalSettings', () => ({ getApprovalPolicies: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => true, hasPermission: (name: string) => h.hasPermission(name) }
})
vi.mock('@/stores/approvalPolicy', () => ({ useApprovalPolicyStore: () => ({ policies: [] }) }))
vi.mock('@/stores/notification', () => ({ useNotificationStore: () => ({ addNotification: vi.fn(), fetchSummary: vi.fn() }) }))

import WorkbenchApprovalsView from '../WorkbenchApprovalsView.vue'

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'fullscreen', 'destroyOnClose', 'closeOnClickModal', 'beforeClose'],
  emits: ['update:modelValue', 'opened', 'closed'],
  setup(props, { slots }) {
    return () => props.modelValue
      ? vh('div', { class: 'el-dialog-stub' }, [
          vh('div', { class: 'stub-body' }, slots.default?.()),
          vh('div', { class: 'stub-footer' }, slots.footer?.()),
        ])
      : null
  },
})

const mountView = async () => {
  const w = shallowMount(WorkbenchApprovalsView, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        LeaveOverlapOverrideDialog: false,
        FormDialog: false,
        'el-dialog': ElDialogStub,
        ElButton: false,
        ElAlert: false,
        ElForm: false,
        ElFormItem: false,
        ElInput: false,
      },
    },
  })
  await flushPromises()
  return w
}

const OVERLAP_DETAIL =
  '該員工在 2026-11-03 ~ 2026-11-03 已有另一筆已核准的請假（ID: 112），'
  + '若確認仍要核准請帶 force_overlap=true 並填寫 force_overlap_reason'
const overlapError = () => ({ response: { status: 409, data: { detail: OVERLAP_DETAIL } } })
const REASON_OK = '補登假單與既有假單區間重疊，已與員工核對'

type Vm = {
  approveLeave: (row: Record<string, unknown>, approved: boolean) => Promise<void>
  approveOvertime: (row: Record<string, unknown>, approved: boolean) => Promise<void>
  finalizeLeave: (row: Record<string, unknown>) => Promise<void>
}
const vmOf = (w: VueWrapper) => (w.vm as unknown as { $: { setupState: Vm } }).$.setupState
const submitBtn = (w: VueWrapper) => w.find('[data-test="form-dialog-submit"]')

/**
 * 無權限時輸入框是 disabled，VTU 的 setValue 會直接略過；這裡改用原生事件把原因灌進去，
 * 讓「原因已足夠但仍不可送出」只取決於權限判斷（否則輸入被擋住，原因不足也會讓鈕停用，測不到權限）。
 */
const typeEvenIfDisabled = async (w: VueWrapper, text: string) => {
  const el = w.find('textarea').element as HTMLTextAreaElement
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('工作台簽核：請假核准遇到重疊假單', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.approveLeave.mockReset()
    h.approveOvertime.mockReset()
    h.hasPermission.mockReset()
    h.hasPermission.mockImplementation(() => true)
    vi.spyOn(ElMessage, 'error').mockImplementation((() => ({ close: () => {} })) as never)
    vi.spyOn(ElMessage, 'success').mockImplementation((() => ({ close: () => {} })) as never)
  })

  it('核准收到重疊 409 → 彈出確認對話框；填原因確認後以 force_overlap 重送', async () => {
    h.approveLeave.mockRejectedValueOnce(overlapError()).mockResolvedValueOnce({ data: {} })
    const w = await mountView()

    await vmOf(w).approveLeave({ id: 9, substitute_status: 'not_required' }, true)
    await flushPromises()

    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(submitBtn(w).exists()).toBe(true)
    expect(w.text()).not.toContain('force_overlap')

    await w.find('textarea').setValue(REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(h.approveLeave).toHaveBeenNthCalledWith(1, 9, { approved: true })
    expect(h.approveLeave).toHaveBeenNthCalledWith(2, 9, {
      approved: true,
      force_overlap: true,
      force_overlap_reason: REASON_OK,
    })
    expect(ElMessage.success).toHaveBeenCalledWith('請假已核准')
    expect(submitBtn(w).exists()).toBe(false)
  })

  it('核准整張（finalize_all）遇到重疊：重送保留 finalize_all', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    h.approveLeave.mockRejectedValueOnce(overlapError()).mockResolvedValueOnce({ data: {} })
    const w = await mountView()

    await vmOf(w).finalizeLeave({ id: 9, submitter_role: 'teacher' })
    await flushPromises()
    await w.find('textarea').setValue(REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(h.approveLeave).toHaveBeenNthCalledWith(2, 9, {
      approved: true,
      finalize_all: true,
      force_overlap: true,
      force_overlap_reason: REASON_OK,
    })
  })

  it('無金流簽核權限 → 確認鈕停用，不重送', async () => {
    h.hasPermission.mockImplementation((name: string) => name !== 'ACTIVITY_PAYMENT_APPROVE')
    h.approveLeave.mockRejectedValueOnce(overlapError())
    const w = await mountView()

    await vmOf(w).approveLeave({ id: 9, substitute_status: 'not_required' }, true)
    await flushPromises()
    await typeEvenIfDisabled(w, REASON_OK)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(REASON_OK)

    expect(submitBtn(w).attributes('disabled')).toBeDefined()
    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(h.approveLeave).toHaveBeenCalledTimes(1)
  })

  it('非重疊的錯誤 → 不彈對話框，沿用原本的錯誤 toast', async () => {
    h.approveLeave.mockRejectedValueOnce({ response: { status: 409, data: { detail: '此假單已被他人處理' } } })
    const w = await mountView()

    await vmOf(w).approveLeave({ id: 9, substitute_status: 'not_required' }, true)
    await flushPromises()

    expect(submitBtn(w).exists()).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('此假單已被他人處理')
  })

  it('加班核准不接這個對話框：即使錯誤訊息長得一樣也照原本的錯誤 toast', async () => {
    h.approveOvertime.mockRejectedValueOnce(overlapError())
    const w = await mountView()

    await vmOf(w).approveOvertime({ id: 3 }, true)
    await flushPromises()

    expect(submitBtn(w).exists()).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
  })
})
