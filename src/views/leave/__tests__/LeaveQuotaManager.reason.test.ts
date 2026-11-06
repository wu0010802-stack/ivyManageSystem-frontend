/**
 * LeaveQuotaManager 儲存配額必填「調整原因」（QA payroll 2026-11-05 F90 / B90）。
 *
 * 後端 PUT /leaves/quotas/{id} 的 QuotaUpdate 新增必填 reason（去頭尾空白後 5～500 字），
 * 特休調高 >= 8 小時另需金流簽核權限（缺權限 403）。前端原本點「儲存」直接送
 * { total_hours, note }，後端守衛上線後每次都會被擋（缺 reason 回 422）。
 *
 * 這支用真的 FormDialog／el-table／el-input（el-dialog 以最小 stub 取代），驗：
 * - 點「儲存」不直接送出，先開原因對話框
 * - 原因為空／不足 5 字（含只有空白）不送出；5 字才送，payload 帶 trim 後的 reason
 * - 後端 403／400 的訊息顯示給使用者，對話框與編輯狀態保留
 * - 取消不送出；每次開啟原因欄是空的
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h as vh } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import LeaveQuotaManager from '../LeaveQuotaManager.vue'
import FormDialog from '@/components/common/FormDialog.vue'

const getLeaveQuotas = vi.fn()
const updateLeaveQuota = vi.fn()
vi.mock('@/api/leaves', () => ({
  getLeaveQuotas: (...a: unknown[]) => getLeaveQuotas(...a),
  initLeaveQuotas: vi.fn(),
  updateLeaveQuota: (...a: unknown[]) => updateLeaveQuota(...a),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [{ id: 5, name: '測試員工' }] }),
}))
vi.mock('@/api/leaveQuotaExpiry', () => ({
  getEarliestExpiringGrantForEmployee: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  confirmDiscardChanges: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'fullscreen', 'destroyOnClose', 'closeOnClickModal', 'beforeClose'],
  emits: ['update:modelValue', 'opened', 'closed'],
  setup(props, { slots }) {
    return () => props.modelValue
      ? vh('div', { class: 'el-dialog-stub' }, [
          vh('div', { class: 'stub-title' }, props.title),
          vh('div', { class: 'stub-body' }, slots.default?.()),
          vh('div', { class: 'stub-footer' }, slots.footer?.()),
        ])
      : null
  },
})

const ANNUAL_ROW = {
  id: 53,
  leave_type: 'annual',
  leave_type_label: '特休',
  total_hours: 80,
  used_hours: 8,
  pending_hours: 0,
  remaining_hours: 72,
  note: '年資特休',
}

const mountManager = () =>
  mount(LeaveQuotaManager, {
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': ElDialogStub } },
  })

type SetupState = { quotaRows: Array<{ _editing: boolean; _newTotal: number; total_hours: number }> }
const stateOf = (w: VueWrapper) => (w.vm as unknown as { $: { setupState: SetupState } }).$.setupState

const buttonByText = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text() === text)
const submitBtn = (w: VueWrapper) => w.find('[data-test="form-dialog-submit"]')
const isSubmitDisabled = (w: VueWrapper) => submitBtn(w).attributes('disabled') !== undefined

/** 載入員工配額並把第一列切成編輯狀態、改成指定時數。 */
async function loadAndEdit(w: VueWrapper, newTotal: number) {
  ;(w.vm as unknown as { focusEmployee: (id: number) => void }).focusEmployee(5)
  await flushPromises()
  await buttonByText(w, '調整')!.trigger('click')
  stateOf(w).quotaRows[0]._newTotal = newTotal
  await flushPromises()
}

const typeReason = async (w: VueWrapper, text: string) => {
  await w.find('.stub-body textarea').setValue(text)
  await flushPromises()
}

const REASON_OK = '主管核准補發額外特休'

describe('LeaveQuotaManager 儲存配額必填調整原因', () => {
  beforeEach(() => {
    getLeaveQuotas.mockReset()
    getLeaveQuotas.mockResolvedValue({ data: [{ ...ANNUAL_ROW }] })
    updateLeaveQuota.mockReset()
    updateLeaveQuota.mockResolvedValue({ data: { ...ANNUAL_ROW, total_hours: 88, remaining_hours: 80 } })
    vi.spyOn(ElMessage, 'error').mockImplementation((() => ({ close: () => {} })) as never)
    vi.spyOn(ElMessage, 'success').mockImplementation((() => ({ close: () => {} })) as never)
  })

  it('點「儲存」不直接送出，先開原因對話框並顯示前後時數', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)

    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    expect(updateLeaveQuota).not.toHaveBeenCalled()
    expect(w.find('.stub-body textarea').exists()).toBe(true)
    expect(w.find('.stub-body').text()).toContain('80h')
    expect(w.find('.stub-body').text()).toContain('88h')
  })

  it('原因為空：確認鈕停用，且不送出', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    expect(isSubmitDisabled(w)).toBe(true)
    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(updateLeaveQuota).not.toHaveBeenCalled()
  })

  it('原因只有 4 字：確認鈕停用，且不送出', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    await typeReason(w, '補發特休')
    expect(isSubmitDisabled(w)).toBe(true)
    await submitBtn(w).trigger('click')
    await flushPromises()
    expect(updateLeaveQuota).not.toHaveBeenCalled()
  })

  it('原因去頭尾空白後不足 5 字：不送出（空白不算字數）', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    await typeReason(w, '  補發特休  ')
    expect(isSubmitDisabled(w)).toBe(true)
    expect(updateLeaveQuota).not.toHaveBeenCalled()
  })

  it('submit 事件本身也有守衛：原因不足 5 字時即使被觸發也不送出', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    await typeReason(w, '補發特休')
    w.findComponent(FormDialog).vm.$emit('submit')
    await flushPromises()
    expect(updateLeaveQuota).not.toHaveBeenCalled()
  })

  it('原因 5 字：送出 payload 含 reason（trim 後），帶新時數與備註', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    await typeReason(w, '  補發特休額  ')
    expect(isSubmitDisabled(w)).toBe(false)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(updateLeaveQuota).toHaveBeenCalledTimes(1)
    expect(updateLeaveQuota).toHaveBeenCalledWith(53, {
      total_hours: 88,
      note: '年資特休',
      reason: '補發特休額',
    })
  })

  it('儲存成功：對話框關閉、列更新並離開編輯狀態', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()
    await typeReason(w, REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(w.find('.stub-body textarea').exists()).toBe(false)
    expect(stateOf(w).quotaRows[0].total_hours).toBe(88)
    expect(stateOf(w).quotaRows[0]._editing).toBe(false)
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('特休調高被 403 擋下：顯示後端的金流簽核訊息，對話框與編輯狀態保留', async () => {
    updateLeaveQuota.mockRejectedValue({
      response: {
        status: 403,
        data: {
          detail: '特休配額調高 16 小時會增加離職結算與年度結算的折現薪資，需由具備金流簽核權限者處理',
        },
      },
    })
    const w = mountManager()
    await loadAndEdit(w, 96)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()
    await typeReason(w, REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(updateLeaveQuota).toHaveBeenCalledTimes(1)
    const messages = (ElMessage.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.includes('金流簽核權限者處理'))).toBe(true)
    // 沒成功：對話框仍開著、原因還在、列沒被改寫
    expect(w.find('.stub-body textarea').exists()).toBe(true)
    expect((w.find('.stub-body textarea').element as HTMLTextAreaElement).value).toBe(REASON_OK)
    expect(stateOf(w).quotaRows[0].total_hours).toBe(80)
    expect(stateOf(w).quotaRows[0]._editing).toBe(true)
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('後端 400（原因過長等）的訊息也顯示給使用者', async () => {
    updateLeaveQuota.mockRejectedValue({
      response: { status: 400, data: { detail: '原因過長（最多 500 個字）' } },
    })
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()
    await typeReason(w, REASON_OK)
    await submitBtn(w).trigger('click')
    await flushPromises()

    const messages = (ElMessage.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.includes('原因過長'))).toBe(true)
  })

  it('取消對話框：不送出，列仍在編輯狀態；再次開啟原因欄是空的', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()
    await typeReason(w, REASON_OK)

    await w.find('[data-test="form-dialog-cancel"]').trigger('click')
    await flushPromises()
    expect(updateLeaveQuota).not.toHaveBeenCalled()
    expect(w.find('.stub-body textarea').exists()).toBe(false)
    expect(stateOf(w).quotaRows[0]._editing).toBe(true)

    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()
    expect((w.find('.stub-body textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(isSubmitDisabled(w)).toBe(true)
  })

  it('特休列的對話框提示金流簽核門檻；其他假別不顯示', async () => {
    const annual = mountManager()
    await loadAndEdit(annual, 88)
    await buttonByText(annual, '儲存')!.trigger('click')
    await flushPromises()
    expect(annual.find('[data-test="quota-annual-hint"]').exists()).toBe(true)

    getLeaveQuotas.mockResolvedValue({
      data: [{ ...ANNUAL_ROW, id: 54, leave_type: 'sick', leave_type_label: '病假', total_hours: 240 }],
    })
    const sick = mountManager()
    await loadAndEdit(sick, 248)
    await buttonByText(sick, '儲存')!.trigger('click')
    await flushPromises()
    expect(sick.find('[data-test="quota-change"]').text()).toContain('病假')
    expect(sick.find('[data-test="quota-annual-hint"]').exists()).toBe(false)
  })

  it('配額時數欄被清空（el-input-number 會 emit null）：不開原因對話框，提示輸入時數', async () => {
    const warn = vi.spyOn(ElMessage, 'warning').mockImplementation((() => ({ close: () => {} })) as never)
    const w = mountManager()
    await loadAndEdit(w, 88)
    stateOf(w).quotaRows[0]._newTotal = null as unknown as number
    await flushPromises()

    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(w.find('.stub-body').exists()).toBe(false)
    expect(updateLeaveQuota).not.toHaveBeenCalled()
    // 列仍在編輯狀態，使用者補上時數後可以正常儲存
    expect(stateOf(w).quotaRows[0]._editing).toBe(true)
    stateOf(w).quotaRows[0]._newTotal = 88
    await flushPromises()
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()
    expect(w.find('.stub-body textarea').exists()).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('原因字數以字元計（對齊後端 Python len）：3 個 emoji 只算 3 字不可送出，5 個才可', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    await typeReason(w, '😀😀😀')
    expect(isSubmitDisabled(w)).toBe(true)
    expect(w.find('.quota-reason-hint').text()).toContain('目前 3 字')

    await typeReason(w, '😀😀😀😀😀')
    expect(isSubmitDisabled(w)).toBe(false)
    expect(w.find('.quota-reason-hint').text()).toContain('目前 5 字')
  })

  it('原因輸入框限制 500 字（對齊後端上限）', async () => {
    const w = mountManager()
    await loadAndEdit(w, 88)
    await buttonByText(w, '儲存')!.trigger('click')
    await flushPromises()

    expect(w.find('.stub-body textarea').attributes('maxlength')).toBe('500')
  })
})
