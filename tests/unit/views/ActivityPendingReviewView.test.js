/**
 * ActivityPendingReviewView — 時間欄位時區回歸
 *
 * 後端回傳 naive 台灣時間字串（無時區資訊），原本用
 * `new Date(iso).toLocaleString('zh-TW')` 會被瀏覽器時區偏移；
 * 改用專案慣例 helper formatActivityDate（純字串切片，不經 Date）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  listPendingRegistrations: vi.fn(),
  matchRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
  rematchRegistration: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  searchActivityStudents: vi.fn(),
}))

// ── vue-router mock ────────────────────────────────────────────────────────
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// ── element-plus 訊息 mock ─────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

import {
  listPendingRegistrations,
  rejectRegistration,
  restoreRegistration,
  searchActivityStudents,
} from '@/api/activity'
import { ElMessage, ElMessageBox } from 'element-plus'
import ActivityPendingReviewView from '@/views/activity/ActivityPendingReviewView.vue'

// ── 可傳遞 row 資料的 table stubs（同 ActivityCourseView.promote.test.js）──
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      props.data.map((row, index) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      (slots.default?.() || []).map((vnode, index) =>
        h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
      ),
    )
  },
})

const GLOBAL_STUBS = {
  'el-page-header': { template: '<div><slot name="content" /></div>' },
  'el-alert': { template: '<div />' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-date-picker': { template: '<input />' },
  'el-icon': { template: '<span />' },
}

describe('ActivityPendingReviewView — 時間欄位', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('naive 台灣時間字串原樣切片顯示，不經 Date 時區偏移', async () => {
    listPendingRegistrations.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            match_status: 'pending',
            student_name: '王小明',
            birthday: '2021-01-01',
            parent_phone: '0912345678',
            created_at: '2026-06-13T08:30:00',
          },
        ],
        total: 1,
      },
    })

    const wrapper = mount(ActivityPendingReviewView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    // formatActivityDate：'2026-06-13T08:30:00' → '2026-06-13 08:30'
    expect(wrapper.text()).toContain('2026-06-13 08:30')
  })

  it('已拒絕列顯示 reviewed_at（同樣 naive 切片）', async () => {
    listPendingRegistrations.mockResolvedValue({
      data: {
        items: [
          {
            id: 2,
            match_status: 'rejected',
            student_name: '李小華',
            created_at: '2026-06-01T10:00:00',
            reviewed_at: '2026-06-12T23:59:00',
          },
        ],
        total: 1,
      },
    })

    const wrapper = mount(ActivityPendingReviewView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('2026-06-12 23:59')
    expect(wrapper.text()).not.toContain('2026-06-01 10:00')
  })
})

describe('ActivityPendingReviewView — 批次拒絕 / 批次復原', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPendingRegistrations.mockResolvedValue({ data: { items: [], total: 0 } })
  })

  const mountView = () =>
    mount(ActivityPendingReviewView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })

  it('選取拆分：待審走拒絕、已拒走復原（互不影響）', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'pending' },
      { id: 2, match_status: 'rejected' },
      { id: 3, match_status: 'pending' },
    ])
    expect(wrapper.vm.selectedPending.map((r) => r.id)).toEqual([1, 3])
    expect(wrapper.vm.selectedRejected.map((r) => r.id)).toEqual([2])
  })

  it('批次拒絕：對所有待審筆並發送共用原因，全成功提示成功數', async () => {
    rejectRegistration.mockResolvedValue({ data: {} })
    ElMessageBox.prompt.mockResolvedValue({ value: '資料不符合在校生' })
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'pending' },
      { id: 2, match_status: 'rejected' }, // 不應被拒絕
      { id: 3, match_status: 'pending' },
    ])
    await wrapper.vm.handleBatchReject()
    await flushPromises()

    expect(rejectRegistration).toHaveBeenCalledTimes(2)
    expect(rejectRegistration).toHaveBeenCalledWith(1, '資料不符合在校生')
    expect(rejectRegistration).toHaveBeenCalledWith(3, '資料不符合在校生')
    expect(ElMessage.success).toHaveBeenCalledWith('已批次拒絕 2 筆')
  })

  it('批次拒絕：部分失敗 → warning 列出成功/失敗數', async () => {
    rejectRegistration
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error('boom'))
    ElMessageBox.prompt.mockResolvedValue({ value: '共用原因夠長' })
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'pending' },
      { id: 2, match_status: 'pending' },
    ])
    await wrapper.vm.handleBatchReject()
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('批次拒絕完成：成功 1 筆、失敗 1 筆')
  })

  it('批次拒絕：使用者取消 prompt → 不呼叫 API', async () => {
    ElMessageBox.prompt.mockRejectedValue('cancel')
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([{ id: 1, match_status: 'pending' }])
    await wrapper.vm.handleBatchReject()
    expect(rejectRegistration).not.toHaveBeenCalled()
  })

  it('批次復原：對所有已拒筆並發 restore，全成功提示成功數', async () => {
    restoreRegistration.mockResolvedValue({ data: {} })
    ElMessageBox.confirm.mockResolvedValue(true)
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 5, match_status: 'rejected' },
      { id: 6, match_status: 'pending' }, // 不應被復原
      { id: 7, match_status: 'rejected' },
    ])
    await wrapper.vm.handleBatchRestore()
    await flushPromises()

    expect(restoreRegistration).toHaveBeenCalledTimes(2)
    expect(restoreRegistration).toHaveBeenCalledWith(5)
    expect(restoreRegistration).toHaveBeenCalledWith(7)
    expect(ElMessage.success).toHaveBeenCalledWith('已批次復原 2 筆')
  })
})

describe('ActivityPendingReviewView — 手動匹配搜尋競態', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPendingRegistrations.mockResolvedValue({ data: { items: [], total: 0 } })
  })

  const mountView = () =>
    mount(ActivityPendingReviewView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })

  // Bug：runSearch 無 sequence token，亂序到達的過期搜尋回應會覆蓋最新候選人，
  // 使用者點選後 confirmMatch 把報名綁到過期清單的學生（綁錯學生）。
  it('過期搜尋回應不覆蓋最新候選人（out-of-order discard）', async () => {
    let resolveOld
    let resolveNew
    searchActivityStudents
      .mockReturnValueOnce(new Promise((r) => { resolveOld = r }))
      .mockReturnValueOnce(new Promise((r) => { resolveNew = r }))

    const wrapper = mountView()
    await flushPromises()

    // 第一次搜尋（舊查詢，回應較慢）
    wrapper.vm.matchDialog.searchQuery = '舊查詢'
    const p1 = wrapper.vm.runSearch()
    // 第二次搜尋（新查詢，回應較快）
    wrapper.vm.matchDialog.searchQuery = '新查詢'
    const p2 = wrapper.vm.runSearch()

    // 新查詢先 resolve
    resolveNew({ data: { items: [{ id: 2, name: '新候選人' }] } })
    await p2
    await flushPromises()
    // 舊查詢後 resolve（過期，不得覆蓋）
    resolveOld({ data: { items: [{ id: 1, name: '舊候選人' }] } })
    await p1
    await flushPromises()

    expect(wrapper.vm.matchDialog.candidates.map((c) => c.id)).toEqual([2])
  })

  // 跨 dialog reopen：對 row X 開窗（搜尋在途）→ 關閉改對 row Y 開窗（Y 無預填名
  // 故不發新搜尋）→ X 的搜尋晚到，不得污染 Y 對話框的候選人清單。
  it('reopen 後前一個 dialog 的在途搜尋不污染新對話框', async () => {
    let resolveX
    searchActivityStudents.mockReturnValueOnce(new Promise((r) => { resolveX = r }))

    const wrapper = mountView()
    await flushPromises()

    // 對 row X 開窗（有預填名 → 觸發搜尋，但在途）
    wrapper.vm.openMatchDialog({ id: 11, student_name: '張三' })
    await flushPromises()

    // 關閉後改對 row Y 開窗（無預填名 → 不發新搜尋）
    wrapper.vm.openMatchDialog({ id: 22, student_name: '' })
    await flushPromises()

    // X 的搜尋晚到
    resolveX({ data: { items: [{ id: 99, name: 'X 的候選人' }] } })
    await flushPromises()

    // 新對話框（Y）的候選人不得被 X 的過期搜尋污染
    expect(wrapper.vm.matchDialog.candidates).toEqual([])
    expect(wrapper.vm.matchDialog.row.id).toBe(22)
  })
})
