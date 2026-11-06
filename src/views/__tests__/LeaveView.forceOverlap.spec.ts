/**
 * F74：請假核准遇到「與其他已核准假單重疊」時的強制核准入口。
 *
 * 後端契約（api/leaves.py ApproveRequest）：重疊且未帶 force_overlap → 409，訊息內含參數名；
 * 帶 force_overlap 需 force_overlap_reason ≥10 字，且操作者需具 ACTIVITY_PAYMENT_APPROVE（否則 403）。
 * 前端要在 409 時彈確認對話框、收原因，再以同一個核准 payload 加上 force_overlap 重送。
 *
 * 這支測試走真的 useApprovalOperation（不 mock @/composables），驗 LeaveView 的整條接線。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factory 會被提升到檔頭：共用的 mock 與 helper 一律走 vi.hoisted
const h = vi.hoisted(() => ({
  paged: <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 5000, hasMore: false }),
  getLeaves: vi.fn(),
  approveLeave: vi.fn(),
  hasPermission: vi.fn(),
}))

import { defineComponent, h as vh } from 'vue'
import { shallowMount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }) }))
vi.mock('@/api/leaves', () => ({
  getLeaves: h.getLeaves,
  createLeave: vi.fn(),
  updateLeave: vi.fn(),
  approveLeave: h.approveLeave,
  batchApproveLeaves: vi.fn(),
  getLeaveImportTemplate: vi.fn(),
  importLeaves: vi.fn(),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [], fetchPolicies: vi.fn(() => Promise.resolve()) }),
}))
// useApprovalOperation 內部會取 notification store（無 active pinia 會炸）
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({ fetchSummary: vi.fn() }),
}))
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, hasPermission: (name: string) => h.hasPermission(name) }
})

import LeaveView from '@/views/LeaveView.vue'

// el-dialog 會 teleport 到 body；stub 成就地渲染（尊重 modelValue），其餘交給真的 FormDialog／el-button／el-input
const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'fullscreen', 'destroyOnClose', 'closeOnClickModal', 'beforeClose'],
  emits: ['update:modelValue', 'opened', 'closed'],
  setup(props, { slots, emit }) {
    return () => props.modelValue
      ? vh('div', { class: 'el-dialog-stub' }, [
          vh('div', { class: 'stub-header' }, props.title),
          vh('div', { class: 'stub-body' }, slots.default?.()),
          vh('div', { class: 'stub-footer' }, slots.footer?.()),
          vh('button', {
            class: 'stub-x',
            onClick: () => props.beforeClose?.(() => emit('update:modelValue', false)),
          }, 'x'),
        ])
      : null
  },
})

const containerStub = { template: '<div><slot /></div>' }
const mountView = () =>
  shallowMount(LeaveView, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-tabs': containerStub,
        'el-tab-pane': containerStub,
        'el-card': containerStub,
        LoadingPanel: containerStub,
        'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
        'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
        // 受測的強制核准對話框與它依賴的真元件
        LeaveOverlapOverrideDialog: false,
        FormDialog: false,
        'el-dialog': ElDialogStub,
        // shallowMount 的「不要 stub」要用 PascalCase 名稱（kebab-case 的 false 不生效）
        ElButton: false,
        ElAlert: false,
        ElForm: false,
        ElFormItem: false,
        ElInput: false,
      },
    },
  })

const OVERLAP_DETAIL =
  '該員工在 2026-11-03 ~ 2026-11-03 已有另一筆已核准的請假（ID: 112），'
  + '若確認仍要核准請帶 force_overlap=true 並填寫 force_overlap_reason'
const overlapError = () => ({ response: { status: 409, data: { detail: OVERLAP_DETAIL } } })

const REASON_OK = '補登假單與既有假單區間重疊，已與員工核對無誤'
const ROW = { id: 5, substitute_status: 'not_required' }

type Vm = { approveLeave: (row: Record<string, unknown>) => Promise<void> }
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
const cancelBtn = (w: VueWrapper) => w.find('[data-test="form-dialog-cancel"]')

describe('LeaveView 核准遇到重疊假單：強制核准確認', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // mockClear 不清 mockXxxOnce 佇列：前一案例沒用掉的 once 值會漏到下一案例，這裡整個重置
    h.approveLeave.mockReset()
    h.getLeaves.mockReset()
    h.hasPermission.mockReset()
    h.hasPermission.mockImplementation(() => true)
    h.getLeaves.mockResolvedValue(h.paged([]))
    vi.spyOn(ElMessage, 'error').mockImplementation((() => ({ close: () => {} })) as never)
    vi.spyOn(ElMessage, 'success').mockImplementation((() => ({ close: () => {} })) as never)
  })

  it('核准收到 409 重疊 → 彈出確認對話框，顯示衝突假單、不顯示參數名、不跳錯誤 toast', async () => {
    h.approveLeave.mockRejectedValueOnce(overlapError())
    const w = mountView()
    await flushPromises()

    await vmOf(w).approveLeave(ROW)
    await flushPromises()

    expect(submitBtn(w).exists()).toBe(true)
    const text = w.text()
    expect(text).toContain('2026-11-03')
    expect(text).toContain('112')
    expect(text).not.toContain('force_overlap')
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(h.approveLeave).toHaveBeenCalledTimes(1)
  })

  it('原因不足 10 字 → 確認鈕不可按；點了也不重送', async () => {
    h.approveLeave.mockRejectedValueOnce(overlapError())
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave(ROW)
    await flushPromises()

    expect(submitBtn(w).attributes('disabled')).toBeDefined()

    await w.find('textarea').setValue('一二三四五六七八九') // 9 字
    expect(submitBtn(w).attributes('disabled')).toBeDefined()

    await w.find('textarea').setValue('  一二三四五六七八九  ') // 前後空白不算字數
    expect(submitBtn(w).attributes('disabled')).toBeDefined()

    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(h.approveLeave).toHaveBeenCalledTimes(1)
  })

  it('有金流簽核權限 → 原因 ≥10 字後確認，第二次呼叫 payload 帶 force_overlap 與原因，成功後關閉並刷新', async () => {
    h.approveLeave.mockRejectedValueOnce(overlapError()).mockResolvedValueOnce({ data: {} })
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave(ROW)
    await flushPromises()
    h.getLeaves.mockClear()

    await w.find('textarea').setValue(`  ${REASON_OK}  `)
    expect(submitBtn(w).attributes('disabled')).toBeUndefined()
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(h.approveLeave).toHaveBeenCalledTimes(2)
    expect(h.approveLeave).toHaveBeenNthCalledWith(1, 5, { approved: true })
    expect(h.approveLeave).toHaveBeenNthCalledWith(2, 5, {
      approved: true,
      force_overlap: true,
      force_overlap_reason: REASON_OK,
    })
    expect(ElMessage.success).toHaveBeenCalledWith('已核准')
    expect(h.getLeaves).toHaveBeenCalled()
    expect(submitBtn(w).exists()).toBe(false)
  })

  it('無金流簽核權限 → 顯示說明，確認鈕停用，即使原因足夠也不重送', async () => {
    h.hasPermission.mockImplementation((name: string) => name !== 'ACTIVITY_PAYMENT_APPROVE')
    h.approveLeave.mockRejectedValueOnce(overlapError())
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave(ROW)
    await flushPromises()

    expect(w.text()).toContain('金流簽核')
    await typeEvenIfDisabled(w, REASON_OK)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(REASON_OK)
    expect(submitBtn(w).attributes('disabled')).toBeDefined()
    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(h.approveLeave).toHaveBeenCalledTimes(1)
  })

  it('取消 → 不重送，對話框關閉', async () => {
    h.approveLeave.mockRejectedValueOnce(overlapError())
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave(ROW)
    await flushPromises()

    await w.find('textarea').setValue(REASON_OK)
    await cancelBtn(w).trigger('click')
    await flushPromises()

    expect(h.approveLeave).toHaveBeenCalledTimes(1)
    expect(submitBtn(w).exists()).toBe(false)
  })

  it.each([
    ['非重疊的 409', { response: { status: 409, data: { detail: '此假單已被他人處理，請重新整理' } } }, '此假單已被他人處理，請重新整理'],
    ['400', { response: { status: 400, data: { detail: '請假時數超過排班工時' } } }, '請假時數超過排班工時'],
    ['403', { response: { status: 403, data: { detail: '您沒有審核此假單的權限' } } }, '您沒有審核此假單的權限'],
  ])('%s → 不彈強制核准對話框，沿用原本的錯誤 toast', async (_name, err, expected) => {
    h.approveLeave.mockRejectedValueOnce(err)
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave(ROW)
    await flushPromises()

    expect(submitBtn(w).exists()).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith(expected)
    expect(h.approveLeave).toHaveBeenCalledTimes(1)
  })

  it('代理人未確認的二次確認：強制核准重送時保留 force_without_substitute', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    h.approveLeave.mockRejectedValueOnce(overlapError()).mockResolvedValueOnce({ data: {} })
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave({ id: 6, substitute_status: 'pending' })
    await flushPromises()

    await w.find('textarea').setValue(REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(h.approveLeave).toHaveBeenNthCalledWith(2, 6, {
      approved: true,
      force_without_substitute: true,
      force_overlap: true,
      force_overlap_reason: REASON_OK,
    })
  })

  it('重送時後端仍回 403（權限判斷與前端不一致）→ 顯示白話訊息、不含參數名，對話框保持開啟', async () => {
    h.approveLeave
      .mockRejectedValueOnce(overlapError())
      .mockRejectedValueOnce({
        response: {
          status: 403,
          data: { detail: "force_overlap=True 需具備『金流簽核』權限（ACTIVITY_PAYMENT_APPROVE），請改由具該權限者執行" },
        },
      })
    const w = mountView()
    await flushPromises()
    await vmOf(w).approveLeave(ROW)
    await flushPromises()

    await w.find('textarea').setValue(REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledTimes(1)
    const shown = String(vi.mocked(ElMessage.error).mock.calls[0][0])
    expect(shown).toContain('金流簽核')
    expect(shown).not.toContain('force_overlap')
    expect(submitBtn(w).exists()).toBe(true)
  })
})
