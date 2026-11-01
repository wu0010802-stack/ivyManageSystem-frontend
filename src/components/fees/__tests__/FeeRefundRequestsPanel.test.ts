/**
 * FeeRefundRequestsPanel（FIN-F2 學費退費申請待審清單）：
 * - 有待審申請才顯示；清單端點 403（班級受限角色）→ 靜默隱藏
 * - 具 ACTIVITY_PAYMENT_APPROVE 者可核准／駁回；自己的申請按鈕停用並說明原因
 * - 無核准權者只看到「待簽核者核准」
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, h } from 'vue'

const ui = vi.hoisted(() => ({
  confirm: vi.fn(),
  prompt: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: ui.success, error: ui.error, warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: ui.confirm, prompt: ui.prompt },
  }
})

const api = vi.hoisted(() => ({
  getFeeRefundRequests: vi.fn(),
  approveFeeRefundRequest: vi.fn(),
  rejectFeeRefundRequest: vi.fn(),
}))
vi.mock('@/api/fees', () => api)

const auth = vi.hoisted(() => ({
  perms: new Set<string>(),
  userInfo: null as Record<string, unknown> | null,
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => auth.perms.has(name),
  getUserInfo: () => auth.userInfo,
}))

import FeeRefundRequestsPanel from '../FeeRefundRequestsPanel.vue'

const OTHERS = {
  id: 1, record_id: 11, student_id: 3, student_name: '測試生A', fee_item_name: '月費',
  period: '114-1', amount: 1500, reason: '家長申請退費', notes: '', status: 'requested',
  requested_by_name: 'acct', requested_at: '2026-10-31T09:00:00',
}
const MINE = { ...OTHERS, id: 2, record_id: 12, requested_by_name: 'owner' }

// 真 el-table 會為 fixed 欄多渲染一份並以空 row 預跑 slot；改用逐列呼叫 slot 的 stub
const ElTableColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as Record<string, unknown>[]).map((row, i) =>
      h('div', { key: i }, slots.default ? slots.default({ row }) : [])))
  },
})
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (slots.default?.() || []).map((vnode, i) =>
      h(vnode.type as never, { ...vnode.props, data: props.data, key: i }, vnode.children as never)))
  },
})

function mountPanel() {
  return mount(FeeRefundRequestsPanel, {
    global: {
      plugins: [ElementPlus],
      stubs: { 'el-table': ElTableStub, 'el-table-column': ElTableColumnStub },
      directives: { loading: () => {} },
    },
  })
}

function rowButtons(w: ReturnType<typeof mountPanel>, testId: string) {
  return w.findAll(`[data-test="${testId}"]`)
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.perms = new Set(['FEES_READ', 'FEES_WRITE', 'ACTIVITY_PAYMENT_APPROVE'])
  auth.userInfo = { id: 2, username: 'owner' }
  api.getFeeRefundRequests.mockResolvedValue({ total: 2, items: [OTHERS, MINE] })
})

describe('FeeRefundRequestsPanel', () => {
  it('掛載即查待審（status=requested）並列出申請', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(api.getFeeRefundRequests).toHaveBeenCalledWith({ status: 'requested' })
    expect(w.find('[data-test="refund-requests-panel"]').exists()).toBe(true)
    expect(w.text()).toContain('1,500')
    expect(w.text()).toContain('待核准退費申請')
  })

  it('無待審申請 → 整塊不顯示', async () => {
    api.getFeeRefundRequests.mockResolvedValue({ total: 0, items: [] })
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="refund-requests-panel"]').exists()).toBe(false)
  })

  it('清單 403（班級受限角色）→ 靜默隱藏、不跳錯誤', async () => {
    api.getFeeRefundRequests.mockRejectedValue({ response: { status: 403, data: { detail: '非管理角色不得列出全校退費申請' } } })
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="refund-requests-panel"]').exists()).toBe(false)
    expect(ui.error).not.toHaveBeenCalled()
  })

  it('自己的申請：核准／駁回停用並說明「需由他人核准」；他人的申請可操作', async () => {
    const w = mountPanel()
    await flushPromises()
    const approves = rowButtons(w, 'approve-fee-refund-request')
    const rejects = rowButtons(w, 'reject-fee-refund-request')
    expect(approves).toHaveLength(2)
    expect(approves[0].attributes('disabled')).toBeUndefined()
    expect(rejects[0].attributes('disabled')).toBeUndefined()
    expect(approves[1].attributes('disabled')).toBeDefined()
    expect(rejects[1].attributes('disabled')).toBeDefined()
    const notes = w.findAll('[data-test="own-request-note"]')
    expect(notes).toHaveLength(1)
    expect(notes[0].text()).toContain('需由他人核准')
  })

  it('無 ACTIVITY_PAYMENT_APPROVE → 不顯示核准／駁回，只顯示待簽核者核准', async () => {
    auth.perms = new Set(['FEES_READ', 'FEES_WRITE'])
    const w = mountPanel()
    await flushPromises()
    expect(rowButtons(w, 'approve-fee-refund-request')).toHaveLength(0)
    expect(w.findAll('[data-test="awaiting-approver"]')).toHaveLength(2)
  })

  it('核准他人申請：確認後呼叫 approve、emit decided 並重抓清單', async () => {
    ui.confirm.mockResolvedValue('confirm')
    api.approveFeeRefundRequest.mockResolvedValue({})
    const w = mountPanel()
    await flushPromises()
    await rowButtons(w, 'approve-fee-refund-request')[0].trigger('click')
    await flushPromises()
    expect(api.approveFeeRefundRequest).toHaveBeenCalledWith(1)
    expect(w.emitted('decided')).toHaveLength(1)
    expect(api.getFeeRefundRequests).toHaveBeenCalledTimes(2)
  })

  it('核准自己的申請（繞過停用直接呼叫）→ 不送 API', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = w.vm as unknown as { doApprove: (r: unknown) => Promise<void>; doReject: (r: unknown) => Promise<void> }
    await vm.doApprove(MINE)
    await vm.doReject(MINE)
    expect(ui.confirm).not.toHaveBeenCalled()
    expect(api.approveFeeRefundRequest).not.toHaveBeenCalled()
    expect(api.rejectFeeRefundRequest).not.toHaveBeenCalled()
  })

  it('核准遇後端 403（如申請人本人）→ 顯示後端原因', async () => {
    ui.confirm.mockResolvedValue('confirm')
    api.approveFeeRefundRequest.mockRejectedValue({
      response: { status: 403, data: { detail: '不可核准自己申請的退款（需由其他人覆核，職責分離）' } },
    })
    const w = mountPanel()
    await flushPromises()
    await rowButtons(w, 'approve-fee-refund-request')[0].trigger('click')
    await flushPromises()
    expect(String(ui.error.mock.calls[0][0])).toContain('不可核准自己申請的退款')
    expect(w.emitted('decided')).toBeUndefined()
  })

  it('駁回：輸入原因後呼叫 reject（trim）並 emit decided', async () => {
    ui.prompt.mockResolvedValue({ value: '  金額有誤請重送  ', action: 'confirm' })
    api.rejectFeeRefundRequest.mockResolvedValue({})
    const w = mountPanel()
    await flushPromises()
    await rowButtons(w, 'reject-fee-refund-request')[0].trigger('click')
    await flushPromises()
    expect(api.rejectFeeRefundRequest).toHaveBeenCalledWith(1, { reason: '金額有誤請重送' })
    expect(w.emitted('decided')).toHaveLength(1)
  })
})
