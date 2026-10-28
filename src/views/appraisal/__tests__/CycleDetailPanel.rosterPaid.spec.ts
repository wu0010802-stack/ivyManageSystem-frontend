import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import CycleDetailPanel from '@/views/appraisal/CycleDetailPanel.vue'

// 考核名冊已發放標記（義華 2026-10-27）：CLOSED 週期可由 APPRAISAL_ACCOUNTING 標記／取消，
// 標記後年終考核 payout 不再為該學期產生明細。

vi.mock('@/api/appraisal', () => ({
  listAppraisalParticipants: vi.fn().mockResolvedValue({ data: [] }),
  listAppraisalSummaries: vi.fn().mockResolvedValue({ data: [] }),
  listAppraisalCatalog: vi.fn().mockResolvedValue({ data: [] }),
  recomputeAppraisalSummaries: vi.fn(),
  signSupervisorAppraisalSummary: vi.fn(),
  signAccountingAppraisalSummary: vi.fn(),
  finalizeAppraisalSummary: vi.fn(),
  listAppraisalCycles: vi.fn(),
  exportAppraisalCycleXlsxUrl: vi.fn().mockReturnValue('/x'),
  getSignStatusSummary: vi.fn().mockResolvedValue({ data: { cycle_id: 5, counts: {}, buckets: [] } }),
  getAppraisalAllEmployeesStatus: vi.fn().mockResolvedValue({ data: { participants: [] } }),
  listScoringRules: vi.fn().mockResolvedValue({ data: [] }),
  markAppraisalCycleRosterPaid: vi.fn(),
  unmarkAppraisalCycleRosterPaid: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  ElMessageBox: { prompt: vi.fn(), confirm: vi.fn() },
}))

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: pushMock }),
}))

const perms = new Set<string>()
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => perms.has(name),
}))

import * as appraisalApi from '@/api/appraisal'
import { ElMessage, ElMessageBox } from 'element-plus'

const CLOSED_CYCLE = {
  id: 5,
  academic_year: 114,
  semester: 'SECOND',
  base_score_calc_date: '2026-03-15',
  base_score: 75.6,
  status: 'CLOSED',
  roster_paid_at: null,
  roster_paid_by: null,
  roster_paid_note: null,
}
const PAID_CYCLE = {
  ...CLOSED_CYCLE,
  roster_paid_at: '2026-10-27T15:30:00+08:00',
  roster_paid_by: 'finance01',
  roster_paid_note: '115/02 名冊轉帳',
}

const stubs = {
  KanbanView: true,
  ListView: true,
  RejectDialog: true,
  CommentDialog: true,
  BatchSignButton: true,
  SignProgressBar: true,
  EmployeeSummaryDrawer: true,
  ElAlert: {
    props: ['title'],
    emits: ['close'],
    template: '<div class="alert"><span class="alert-title">{{ title }}</span><slot /></div>',
  },
  ElButton: {
    props: ['loading', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}

async function mountPanel(cycle: Record<string, unknown>, permissions: string[] = ['APPRAISAL_ACCOUNTING']) {
  perms.clear()
  permissions.forEach((p) => perms.add(p))
  vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [cycle] } as never)
  const wrapper = mount(CycleDetailPanel, { props: { cycleId: 5 }, global: { stubs } })
  await flushPromises()
  return wrapper
}

describe('CycleDetailPanel — 名冊已發放標記', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('已封存、尚未標記、有會計核數字權限：顯示「標記名冊已發放」，沒有已發放提示列', async () => {
    const wrapper = await mountPanel(CLOSED_CYCLE)

    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(false)
  })

  it.each(['OPEN', 'LOCKED'])('週期狀態 %s 不顯示標記入口（後端只收 CLOSED）', async (status) => {
    const wrapper = await mountPanel({ ...CLOSED_CYCLE, status })

    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(false)
  })

  it('沒有 APPRAISAL_ACCOUNTING 權限：不顯示標記入口', async () => {
    const wrapper = await mountPanel(CLOSED_CYCLE, ['APPRAISAL_READ'])

    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(false)
  })

  it('標記：確認文案說明年終影響，備註送給後端，成功後顯示已發放提示並收起入口', async () => {
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '115/02 名冊轉帳', action: 'confirm' } as never)
    vi.mocked(appraisalApi.markAppraisalCycleRosterPaid).mockResolvedValue({ data: PAID_CYCLE } as never)
    const wrapper = await mountPanel(CLOSED_CYCLE)

    await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
    await flushPromises()

    const promptMessage = vi.mocked(ElMessageBox.prompt).mock.calls[0][0] as string
    expect(promptMessage).toContain('114 學年下學期')
    expect(promptMessage).toContain('不會自動刪除')
    expect(appraisalApi.markAppraisalCycleRosterPaid).toHaveBeenCalledWith(5, '115/02 名冊轉帳')
    expect(ElMessage.success).toHaveBeenCalled()

    const note = wrapper.find('[data-test="roster-paid-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('2026-10-27 15:30')
    expect(note.text()).toContain('finance01')
    expect(note.text()).toContain('115/02 名冊轉帳')
    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(false)
  })

  it('標記時按取消：不呼叫後端、畫面不變', async () => {
    vi.mocked(ElMessageBox.prompt).mockRejectedValue('cancel')
    const wrapper = await mountPanel(CLOSED_CYCLE)

    await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
    await flushPromises()

    expect(appraisalApi.markAppraisalCycleRosterPaid).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(true)
  })

  it('標記失敗（例如 409）：顯示錯誤、仍可再試，不假裝已標記', async () => {
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '', action: 'confirm' } as never)
    vi.mocked(appraisalApi.markAppraisalCycleRosterPaid).mockRejectedValue({
      response: { status: 409, data: { detail: '此週期已標記考核名冊已發放' } },
    })
    const wrapper = await mountPanel(CLOSED_CYCLE)

    await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('此週期已標記考核名冊已發放'))
    expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(true)
  })

  it('已標記：顯示標記時間、標記人、備註與年終影響；有權限者可取消', async () => {
    const wrapper = await mountPanel(PAID_CYCLE)

    const note = wrapper.find('[data-test="roster-paid-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('名冊已發放')
    expect(note.text()).toContain('2026-10-27 15:30')
    expect(note.text()).toContain('finance01')
    expect(note.text()).toContain('不會再產生')
    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="roster-paid-unmark"]').exists()).toBe(true)
  })

  it('已標記但沒有權限：看得到提示，沒有取消入口', async () => {
    const wrapper = await mountPanel(PAID_CYCLE, ['APPRAISAL_READ'])

    expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="roster-paid-unmark"]').exists()).toBe(false)
  })

  it('取消標記：先確認，成功後提示列消失、標記入口回來', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(appraisalApi.unmarkAppraisalCycleRosterPaid).mockResolvedValue({ data: CLOSED_CYCLE } as never)
    const wrapper = await mountPanel(PAID_CYCLE)

    await wrapper.find('[data-test="roster-paid-unmark"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(appraisalApi.unmarkAppraisalCycleRosterPaid).toHaveBeenCalledWith(5)
    expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(true)
  })

  it('取消標記時按「保留標記」：不呼叫後端', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const wrapper = await mountPanel(PAID_CYCLE)

    await wrapper.find('[data-test="roster-paid-unmark"]').trigger('click')
    await flushPromises()

    expect(appraisalApi.unmarkAppraisalCycleRosterPaid).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(true)
  })

  describe('標記被 409 擋下：該半年年終明細已存在', () => {
    const PAYOUT_EXISTS_DETAIL =
      '此半年的考核年終獎金明細已在年終產生（或已匯入），標記已發放只能擋之後的產生；請先到「考核年終獎金」頁作廢該年度的明細（payout void）後再標記，否則年終仍會照明細重複發放'

    const rejectMarkWith = (detail: string) => {
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '', action: 'confirm' } as never)
      vi.mocked(appraisalApi.markAppraisalCycleRosterPaid).mockRejectedValue({
        response: { status: 409, data: { detail } },
      })
    }

    it('顯示後端 detail（常駐），有考核定案權限者給前往作廢的入口，帶上該週期所屬的發放年', async () => {
      rejectMarkWith(PAYOUT_EXISTS_DETAIL)
      const wrapper = await mountPanel(CLOSED_CYCLE, ['APPRAISAL_ACCOUNTING', 'APPRAISAL_FINALIZE'])

      await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
      await flushPromises()

      const conflict = wrapper.find('[data-test="roster-paid-conflict"]')
      expect(conflict.exists()).toBe(true)
      expect(conflict.text()).toContain('payout void')
      expect(conflict.text()).toContain('作廢該年度的明細')
      expect(ElMessage.error).toHaveBeenCalledWith(PAYOUT_EXISTS_DETAIL)
      // 沒標記成功：仍看不到已發放提示，標記入口還在
      expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="roster-paid-mark"]').exists()).toBe(true)

      await wrapper.find('[data-test="roster-paid-goto-payout"]').trigger('click')
      // CLOSED_CYCLE 是 114 學年 → 發放年 2027
      expect(pushMock).toHaveBeenCalledWith({ path: '/year-end/appraisal-payout', query: { year: '2027' } })
    })

    it('沒有考核定案權限：不給入口，改說明需要誰來作廢', async () => {
      rejectMarkWith(PAYOUT_EXISTS_DETAIL)
      const wrapper = await mountPanel(CLOSED_CYCLE, ['APPRAISAL_ACCOUNTING'])

      await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="roster-paid-conflict"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="roster-paid-goto-payout"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="roster-paid-no-payout-permission"]').text()).toContain('APPRAISAL_FINALIZE')
    })

    it('其他 409（例如已被別人標記）只跳錯誤訊息，不引導去作廢', async () => {
      rejectMarkWith('此週期已標記考核名冊已發放')
      const wrapper = await mountPanel(CLOSED_CYCLE, ['APPRAISAL_ACCOUNTING', 'APPRAISAL_FINALIZE'])

      await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith('此週期已標記考核名冊已發放')
      expect(wrapper.find('[data-test="roster-paid-conflict"]').exists()).toBe(false)
    })

    it('作廢完回來再標記成功：常駐訊息消失', async () => {
      rejectMarkWith(PAYOUT_EXISTS_DETAIL)
      const wrapper = await mountPanel(CLOSED_CYCLE, ['APPRAISAL_ACCOUNTING', 'APPRAISAL_FINALIZE'])
      await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="roster-paid-conflict"]').exists()).toBe(true)

      vi.mocked(appraisalApi.markAppraisalCycleRosterPaid).mockResolvedValue({ data: PAID_CYCLE } as never)
      await wrapper.find('[data-test="roster-paid-mark"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="roster-paid-conflict"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="roster-paid-note"]').exists()).toBe(true)
    })
  })
})
