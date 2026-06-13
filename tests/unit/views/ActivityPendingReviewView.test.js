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

import { listPendingRegistrations } from '@/api/activity'
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
