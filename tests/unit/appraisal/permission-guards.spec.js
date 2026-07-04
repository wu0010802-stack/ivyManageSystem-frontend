/**
 * P0-A：考核 UI hasPermission 守衛回歸測試。
 *
 * 原本財務動作按鈕（重算 / 批次簽核 / 卡片簽核退簽 / 列表簽核退簽 /
 * 規則編輯）對任何登入 admin 都顯示，繞過後端細粒度 APPRAISAL_*
 * permission bit。改為依各自需要的 permission bit 個別守衛。
 *
 * 策略：用 vi.fn() 控制 hasPermission 回傳，分別驗：
 *   1. 無權限（永遠回 false）→ 守衛元素都不 render
 *   2. 全權限（永遠回 true） → 守衛元素都 render
 * 兩個 case 對比避免「測試永遠 pass 但守衛失效」的 false negative。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, provide, inject } from 'vue'
import { hasPermission } from '@/utils/auth'

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => false),
  getUserInfo: vi.fn(() => ({ user_id: 1, permissions: 0n })),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '1' } }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: () => Promise.resolve({
    data: [{
      id: 1, academic_year: 114, semester: 'FIRST',
      base_score_calc_date: '2026-05-01', base_score: '80', status: 'OPEN',
    }],
  }),
  listAppraisalParticipants: () => Promise.resolve({ data: [] }),
  listAppraisalSummaries: () => Promise.resolve({ data: [] }),
  listAppraisalCatalog: () => Promise.resolve({ data: [] }),
  recomputeAppraisalSummaries: vi.fn(),
  signSupervisorAppraisalSummary: vi.fn(),
  signAccountingAppraisalSummary: vi.fn(),
  finalizeAppraisalSummary: vi.fn(),
  exportAppraisalCycleXlsxUrl: () => '#',
  exportAppraisalTransferRosterXlsxUrl: () => '#',
  batchSignSummaries: vi.fn(),
  listScoringRules: () => Promise.resolve({ data: [] }),
  createScoringRule: vi.fn(),
}))

vi.mock('@/utils/error', () => ({
  apiError: (e, fallback) => fallback || 'error',
}))

import CycleDetailPanel from '@/views/appraisal/CycleDetailPanel.vue'
import SummaryCard from '@/views/appraisal/components/SummaryCard.vue'
import ListView from '@/views/appraisal/components/ListView.vue'
import ScoringRulesPanel from '@/views/appraisal/components/ScoringRulesPanel.vue'
import RuleEditorDialog from '@/views/appraisal/components/RuleEditorDialog.vue'

// 用 transparent stubs（包 default slot + 部分指定 slot），讓 v-if
// 加在 slot 內的 dropdown-item / dialog footer 都能 render 到 DOM。
const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const elStubsBase = {
  'el-button': transparentStub(),
  'el-page-header': transparentStub(),
  'el-radio-group': transparentStub(),
  'el-radio-button': transparentStub(),
  'el-dropdown': transparentStub(['default', 'dropdown']),
  'el-dropdown-menu': transparentStub(),
  'el-dropdown-item': transparentStub(),
  'el-icon': transparentStub(),
  'el-checkbox': transparentStub(),
  'el-tag': transparentStub(),
  // el-table / el-table-column 是 scoped slot 巢狀關係：每個 column 對每個
  // row 都要 render 一次。stub 做法：el-table 對 default slot iterate
  // data，每次給 column 一個不同的 row（透過 provide ref），column
  // 從 inject 拿 row 再把它丟回給自己的 default slot。
  'el-table': {
    props: ['data'],
    setup(props, { slots }) {
      return () => {
        const rows = props.data || []
        return h(
          'div',
          rows.map((row) => {
            // 對每個 row 包一個小元件，內部 provide row 給 column 用
            const RowProvider = {
              setup(_, { slots: rowSlots }) {
                provide('current-row', row)
                return () => h('div', rowSlots.default?.())
              },
            }
            return h(RowProvider, null, { default: () => slots.default?.() })
          }),
        )
      }
    },
  },
  'el-table-column': {
    setup(_, { slots }) {
      return () => {
        const row = inject('current-row', null)
        return h('div', slots.default ? slots.default({ row }) : null)
      }
    },
  },
  'el-form': transparentStub(),
  'el-form-item': transparentStub(),
  'el-input': transparentStub(),
  'el-input-number': transparentStub(),
  'el-date-picker': transparentStub(),
  'el-select': transparentStub(),
  'el-option': transparentStub(),
  'el-dialog': transparentStub(['default', 'footer']),
}

// 額外名稱字串 stub（不需要 render slot 的元件）
const componentStubs = (extra = {}) => ({ ...elStubsBase, ...extra })

function setAllPermissionsTo(value) {
  hasPermission.mockImplementation(() => value)
}

describe('P0-A 考核 UI 權限守衛', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAllPermissionsTo(false)
  })

  // ===== CycleDetailView =====
  describe('CycleDetailPanel toolbar', () => {
    async function mountView(selected = []) {
      const wrapper = mount(CycleDetailPanel, {
        props: { cycleId: 1 },
        global: {
          stubs: componentStubs({
            KanbanView: true,
            ListView: true,
            BatchSignButton: true,
            RejectDialog: true,
            CommentDialog: true,
            SummaryLogDrawer: true,
          }),
        },
      })
      // wait for onMounted load
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()
      wrapper.vm.selectedIds = selected
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('無權限時：重算按鈕與批次簽核區都不 render', async () => {
      const w = await mountView([1, 2])
      expect(w.find('[data-test="recompute-btn"]').exists()).toBe(false)
      expect(w.find('[data-test="batch-zone"]').exists()).toBe(false)
    })

    it('有 APPRAISAL_EVENT_WRITE 時重算按鈕 render', async () => {
      hasPermission.mockImplementation(
        (p) => p === 'APPRAISAL_EVENT_WRITE',
      )
      const w = await mountView([])
      expect(w.find('[data-test="recompute-btn"]').exists()).toBe(true)
    })

    it('有 APPRAISAL_REVIEW 且選了 ids 時批次簽核 zone render', async () => {
      hasPermission.mockImplementation((p) => p === 'APPRAISAL_REVIEW')
      const w = await mountView([10, 11])
      expect(w.find('[data-test="batch-zone"]').exists()).toBe(true)
    })

    it('全權限時：重算 + 批次區同時 render', async () => {
      setAllPermissionsTo(true)
      const w = await mountView([10])
      expect(w.find('[data-test="recompute-btn"]').exists()).toBe(true)
      expect(w.find('[data-test="batch-zone"]').exists()).toBe(true)
    })
  })

  // ===== SummaryCard =====
  describe('SummaryCard dropdown', () => {
    function mountCard() {
      return mount(SummaryCard, {
        props: {
          summary: {
            id: 1, employee_name: '張三', total_score: '85', grade: 'GOOD',
            bonus_amount: '0', status: 'DRAFT',
          },
          selected: false,
          showMenu: true,
        },
        global: { stubs: componentStubs() },
      })
    }

    it('無權限時：簽核 / 退簽 item 不 render', () => {
      const w = mountCard()
      expect(w.find('[data-test="dropdown-item-sign"]').exists()).toBe(false)
      expect(w.find('[data-test="dropdown-item-reject"]').exists()).toBe(false)
    })

    it('全權限時：簽核 / 退簽 item 都 render', () => {
      setAllPermissionsTo(true)
      const w = mountCard()
      expect(w.find('[data-test="dropdown-item-sign"]').exists()).toBe(true)
      expect(w.find('[data-test="dropdown-item-reject"]').exists()).toBe(true)
    })
  })

  // ===== ListView =====
  describe('ListView 簽核 / 退簽按鈕', () => {
    function mountList(grantedProps = {}) {
      return mount(ListView, {
        props: {
          cycleId: 1,
          participants: [
            { id: 10 }, { id: 11 }, { id: 12 }, { id: 13 },
          ],
          summaryByParticipant: {
            10: { id: 100, status: 'DRAFT', total_score: '80', grade: 'GOOD', bonus_amount: '0' },
            11: { id: 101, status: 'SUPERVISOR_SIGNED', total_score: '80', grade: 'GOOD', bonus_amount: '0' },
            12: { id: 102, status: 'ACCOUNTING_SIGNED', total_score: '80', grade: 'GOOD', bonus_amount: '0' },
            13: { id: 103, status: 'FINALIZED', total_score: '80', grade: 'GOOD', bonus_amount: '0' },
          },
          catalog: [], selectedIds: [], busy: false,
          ...grantedProps,
        },
        global: { stubs: componentStubs() },
      })
    }

    it('無權限時：所有 sign / reject 按鈕都不 render（props 預設 false）', () => {
      const w = mountList()
      // sign 按鈕（DRAFT 主管簽 / SUPERVISOR_SIGNED 會計簽 / ACCOUNTING_SIGNED 核定）
      expect(w.find('[data-test="sign-btn-10"]').exists()).toBe(false)
      expect(w.find('[data-test="sign-btn-11"]').exists()).toBe(false)
      expect(w.find('[data-test="sign-btn-12"]').exists()).toBe(false)
      // reject 按鈕（3 個 stage 都有）
      expect(w.find('[data-test="reject-btn-11"]').exists()).toBe(false)
      expect(w.find('[data-test="reject-btn-12"]').exists()).toBe(false)
      expect(w.find('[data-test="reject-btn-13"]').exists()).toBe(false)
    })

    it('全權限 props 注入時：所有 sign / reject 按鈕都 render', () => {
      const w = mountList({
        canSignSupervisor: true,
        canSignAccounting: true,
        canFinalize: true,
        canReject: true,
      })
      expect(w.find('[data-test="sign-btn-10"]').exists()).toBe(true)
      expect(w.find('[data-test="sign-btn-11"]').exists()).toBe(true)
      expect(w.find('[data-test="sign-btn-12"]').exists()).toBe(true)
      expect(w.find('[data-test="reject-btn-11"]').exists()).toBe(true)
      expect(w.find('[data-test="reject-btn-12"]').exists()).toBe(true)
      expect(w.find('[data-test="reject-btn-13"]').exists()).toBe(true)
    })

    it('只有 canSignSupervisor=true 時：只有 DRAFT row 顯示 sign-btn', () => {
      const w = mountList({ canSignSupervisor: true })
      expect(w.find('[data-test="sign-btn-10"]').exists()).toBe(true)
      expect(w.find('[data-test="sign-btn-11"]').exists()).toBe(false)
      expect(w.find('[data-test="sign-btn-12"]').exists()).toBe(false)
      expect(w.find('[data-test="reject-btn-11"]').exists()).toBe(false)
    })
  })

  // ===== ScoringRulesPanel =====
  describe('ScoringRulesPanel 編輯按鈕', () => {
    async function mountPanel() {
      const w = mount(ScoringRulesPanel, {
        global: {
          stubs: componentStubs({
            RuleEditorDialog: true,
            RuleHistoryDrawer: true,
          }),
        },
      })
      await new Promise((r) => setTimeout(r, 0))
      await w.vm.$nextTick()
      return w
    }

    it('無 APPRAISAL_RULE_WRITE 時：14 張卡的編輯按鈕都不 render', async () => {
      const w = await mountPanel()
      expect(w.findAll('[data-test^="edit-btn-"]').length).toBe(0)
      // 歷史按鈕應保留（讀取性質）
      expect(w.findAll('[data-test^="history-btn-"]').length).toBeGreaterThan(0)
    })

    it('有 APPRAISAL_RULE_WRITE 時：編輯按鈕 render', async () => {
      hasPermission.mockImplementation((p) => p === 'APPRAISAL_RULE_WRITE')
      const w = await mountPanel()
      expect(w.findAll('[data-test^="edit-btn-"]').length).toBeGreaterThan(0)
    })
  })

  // ===== RuleEditorDialog =====
  describe('RuleEditorDialog submit', () => {
    function mountDialog() {
      return mount(RuleEditorDialog, {
        props: {
          visible: true,
          itemCode: 'LATE_EARLY',
          existingRule: null,
        },
        global: { stubs: componentStubs() },
      })
    }

    it('無 APPRAISAL_RULE_WRITE 時：submit 按鈕不 render', () => {
      const w = mountDialog()
      expect(w.find('[data-test="submit-btn"]').exists()).toBe(false)
    })

    it('有 APPRAISAL_RULE_WRITE 時：submit 按鈕 render', () => {
      hasPermission.mockImplementation((p) => p === 'APPRAISAL_RULE_WRITE')
      const w = mountDialog()
      expect(w.find('[data-test="submit-btn"]').exists()).toBe(true)
    })
  })
})
