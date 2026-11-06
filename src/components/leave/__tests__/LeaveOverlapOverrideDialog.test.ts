/**
 * LeaveOverlapOverrideDialog：直接驅動 handle()（等同 useApprovalOperation 的 interceptError），
 * 搭配真的 FormDialog／el-button／el-input，驗確認鈕可用性、重送 payload 與各種錯誤分流。
 * 與 LeaveView.forceOverlap.spec.ts 互補：那支驗整頁接線，這支驗元件自身的邊界。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ hasPermission: vi.fn() }))

import { defineComponent, h as vh } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import LeaveOverlapOverrideDialog from '@/components/leave/LeaveOverlapOverrideDialog.vue'
import type { ApprovalRequest } from '@/composables/useApprovalOperation'

vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, hasPermission: (name: string) => h.hasPermission(name) }
})
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ confirmDiscardChanges: vi.fn().mockResolvedValue(true) }))
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }) }))

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'fullscreen', 'destroyOnClose', 'closeOnClickModal', 'beforeClose'],
  emits: ['update:modelValue', 'opened', 'closed'],
  setup(props, { slots, emit }) {
    return () => props.modelValue
      ? vh('div', { class: 'el-dialog-stub' }, [
          vh('div', { class: 'stub-body' }, slots.default?.()),
          vh('div', { class: 'stub-footer' }, slots.footer?.()),
        ])
      : null
  },
})

type Exposed = { handle: (error: unknown, request: ApprovalRequest) => boolean }

const mountDialog = () =>
  mount(LeaveOverlapOverrideDialog, {
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': ElDialogStub } },
  })
const handleOf = (w: VueWrapper) => (w.vm as unknown as Exposed).handle

const OVERLAP_DETAIL =
  '該員工在 2026-11-03 ~ 2026-11-03 已有另一筆已核准的請假（ID: 112），'
  + '若確認仍要核准請帶 force_overlap=true 並填寫 force_overlap_reason'
const overlapError = () => ({ response: { status: 409, data: { detail: OVERLAP_DETAIL } } })
const REASON_OK = '補登假單與既有假單區間重疊，已與員工核對'

const makeRequest = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 5,
  payload: { approved: true },
  successMsg: '已核准',
  retry: vi.fn().mockResolvedValue(true),
  ...overrides,
})

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
const isDisabled = (w: VueWrapper) => submitBtn(w).attributes('disabled') !== undefined

describe('LeaveOverlapOverrideDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.hasPermission.mockReset()
    h.hasPermission.mockImplementation(() => true)
    vi.spyOn(ElMessage, 'error').mockImplementation((() => ({ close: () => {} })) as never)
  })

  it('handle：重疊 409 → 回 true 並開啟；其他錯誤 → 回 false 且不開', async () => {
    const w = mountDialog()
    expect(handleOf(w)({ response: { status: 409, data: { detail: '此假單已被他人處理' } } }, makeRequest())).toBe(false)
    expect(handleOf(w)({ response: { status: 400, data: { detail: '時數超過' } } }, makeRequest())).toBe(false)
    expect(handleOf(w)(new Error('Network Error'), makeRequest())).toBe(false)
    await flushPromises()
    expect(submitBtn(w).exists()).toBe(false)

    expect(handleOf(w)(overlapError(), makeRequest())).toBe(true)
    await flushPromises()
    expect(submitBtn(w).exists()).toBe(true)
  })

  it('駁回（approved:false）即使收到同樣的錯誤也不接手', async () => {
    const w = mountDialog()
    expect(handleOf(w)(overlapError(), makeRequest({ payload: { approved: false, rejection_reason: '不符' } }))).toBe(false)
    await flushPromises()
    expect(submitBtn(w).exists()).toBe(false)
  })

  it('原因剛好 9 字不可按、10 字可按（前後空白不算）', async () => {
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest())
    await flushPromises()

    await w.find('textarea').setValue('一二三四五六七八九')
    expect(isDisabled(w)).toBe(true)
    await w.find('textarea').setValue('  一二三四五六七八九  ')
    expect(isDisabled(w)).toBe(true)
    await w.find('textarea').setValue('一二三四五六七八九十')
    expect(isDisabled(w)).toBe(false)
  })

  it('確認時 retry 收到「原 payload ＋ force_overlap ＋ 去空白的原因」，原 payload 不被改動', async () => {
    const retry = vi.fn().mockResolvedValue(true)
    const payload = { approved: true, finalize_all: true }
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest({ payload, retry }))
    await flushPromises()

    await w.find('textarea').setValue(`  ${REASON_OK}  `)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(retry).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledWith({
      approved: true,
      finalize_all: true,
      force_overlap: true,
      force_overlap_reason: REASON_OK,
    })
    expect(payload).toEqual({ approved: true, finalize_all: true })
    expect(submitBtn(w).exists()).toBe(false)
  })

  it('重送失敗（retry 回 false）→ 對話框保持開啟、保留已填原因，可再試', async () => {
    const retry = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest({ retry }))
    await flushPromises()

    await w.find('textarea').setValue(REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(submitBtn(w).exists()).toBe(true)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(REASON_OK)

    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(retry).toHaveBeenCalledTimes(2)
    expect(submitBtn(w).exists()).toBe(false)
  })

  it('沒有 ACTIVITY_PAYMENT_APPROVE：顯示說明、輸入與確認鈕停用，retry 不會被呼叫', async () => {
    h.hasPermission.mockImplementation((name: string) => name !== 'ACTIVITY_PAYMENT_APPROVE')
    const retry = vi.fn()
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest({ retry }))
    await flushPromises()

    expect(w.find('[data-test="overlap-no-permission"]').exists()).toBe(true)
    expect(w.text()).toContain('需具金流簽核權限者處理')
    expect(w.find('textarea').attributes('disabled')).toBeDefined()
    await typeEvenIfDisabled(w, REASON_OK)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(REASON_OK)
    expect(isDisabled(w)).toBe(true)
    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(retry).not.toHaveBeenCalled()
  })

  it('有權限時不顯示「需具金流簽核權限者處理」說明', async () => {
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest())
    await flushPromises()
    expect(w.find('[data-test="overlap-no-permission"]').exists()).toBe(false)
  })

  it('對話框內文與衝突描述不出現 API 參數名', async () => {
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest())
    await flushPromises()
    expect(w.find('[data-test="overlap-conflict"]').text()).toContain('假單 #112')
    expect(w.text()).not.toContain('force_overlap')
  })

  it('強制核准重送被 403 擋下：handle 回 true（呼叫端不再跳通用錯誤），改顯示白話訊息', () => {
    const w = mountDialog()
    const forbidden = {
      response: {
        status: 403,
        data: { detail: "force_overlap=True 需具備『金流簽核』權限（ACTIVITY_PAYMENT_APPROVE），請改由具該權限者執行" },
      },
    }
    expect(handleOf(w)(forbidden, makeRequest({ payload: { approved: true, force_overlap: true } }))).toBe(true)
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
    const shown = String(vi.mocked(ElMessage.error).mock.calls[0][0])
    expect(shown).toContain('金流簽核')
    expect(shown).not.toContain('force_overlap')
  })

  it('一般 403（不含參數名）不接手', () => {
    const w = mountDialog()
    const forbidden = { response: { status: 403, data: { detail: '您沒有審核此假單的權限' } } }
    expect(handleOf(w)(forbidden, makeRequest())).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('關閉後再開：原因清空；對話框開著時再收到重疊錯誤只更新描述、保留已填原因', async () => {
    const w = mountDialog()
    handleOf(w)(overlapError(), makeRequest())
    await flushPromises()
    await w.find('textarea').setValue(REASON_OK)

    const second = { response: { status: 409, data: { detail: OVERLAP_DETAIL.replace('112', '113') } } }
    handleOf(w)(second, makeRequest())
    await flushPromises()
    expect(w.find('[data-test="overlap-conflict"]').text()).toContain('#113')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe(REASON_OK)

    await w.find('[data-test="form-dialog-cancel"]').trigger('click')
    await flushPromises()
    expect(submitBtn(w).exists()).toBe(false)

    handleOf(w)(overlapError(), makeRequest())
    await flushPromises()
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })
})
