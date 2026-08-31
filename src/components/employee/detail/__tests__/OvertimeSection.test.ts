// src/components/employee/detail/__tests__/OvertimeSection.test.ts
// 員工詳情頁「加班紀錄」唯讀子區塊：以 employee_id + 月份查 getOvertimes（PagedResult 取 .items，
// 契約與出勤的裸陣列 .data 不同）、桌機表格／手機卡片雙版面、狀態中文化、合計行只計已核准。
// 唯讀設計：編輯／審核一律走既有加班管理頁，本區塊不出現任何操作按鈕。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import type { VNode } from 'vue'
import OvertimeSection from '../OvertimeSection.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { getOvertimes } from '@/api/overtimes'

vi.mock('@/api/overtimes', () => ({ getOvertimes: vi.fn() }))
const mockGetOvertimes = getOvertimes as unknown as ReturnType<typeof vi.fn>

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile }) }))

function overtimeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    employee_id: 1,
    employee_name: '王小明',
    submitter_role: 'admin',
    overtime_date: '2026-08-05',
    overtime_type: 'weekday',
    overtime_type_label: '平日加班',
    start_time: '18:00',
    end_time: '20:00',
    hours: 2,
    overtime_pay: 500,
    use_comp_leave: false,
    comp_leave_granted: null,
    status: 'approved',
    approved_by: '園長',
    reason: '活動籌備',
    created_at: null,
    ...overrides,
  }
}

function paged(items: Record<string, unknown>[]) {
  return { items, total: items.length, page: 1, pageSize: 5000, hasMore: false }
}

// el-table 逐列轉發 data 給 column，column 依 data 呼叫 #default(scope.row)（同 AttendanceSection 測試慣例）
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as Record<string, unknown>[]).map((row, index) =>
      h('div', { key: index, class: 'cell' }, slots.default ? slots.default({ row }) : [])))
  },
})
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-table' }, (slots.default?.() || []).map((vnode: VNode, index: number) =>
      h(vnode.type as string, { ...vnode.props, data: props.data, key: index }, vnode.children as never)))
  },
})
const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type'] },
  'el-date-picker': { template: '<input />' },
  'el-card': { template: '<div class="el-card"><slot /></div>' },
  'el-skeleton': true,
}

async function mountSection(items: Record<string, unknown>[], mobile = false) {
  mockGetOvertimes.mockResolvedValueOnce(paged(items))
  mockIsMobile.value = mobile
  const wrapper = mount(OvertimeSection, {
    props: { employee: { id: 1, employee_id: 'EMP001', name: '王小明' } },
    global: { stubs: GLOBAL_STUBS },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => { mockGetOvertimes.mockReset(); mockIsMobile.value = false })

describe('OvertimeSection 查詢參數', () => {
  it('掛載時以 employee_id + 當月年月查詢', async () => {
    await mountSection([])
    const now = new Date()
    expect(mockGetOvertimes).toHaveBeenCalledWith({
      employee_id: 1,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    })
  })
})

describe('OvertimeSection 桌機表格（唯讀）', () => {
  it('渲染時段與加班費', async () => {
    const wrapper = await mountSection([overtimeRecord()])
    expect(wrapper.text()).toContain('18:00–20:00')
    expect(wrapper.text()).toContain('NT$500')
  })

  it('時段缺起訖時間 fallback 顯示 —', async () => {
    const wrapper = await mountSection([overtimeRecord({ start_time: null, end_time: null })])
    expect(wrapper.text()).toContain('—')
  })

  it('唯讀：不出現編輯/刪除等操作按鈕', async () => {
    const wrapper = await mountSection([overtimeRecord()])
    expect(wrapper.text()).not.toContain('編輯')
    expect(wrapper.text()).not.toContain('刪除')
    // 「核准」是狀態標籤（已核准）的子字串，不能用文字斷言；唯讀=整個區塊沒有任何按鈕
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})

describe('OvertimeSection 狀態中文化', () => {
  const CASES: [string, string][] = [
    ['pending', '待審核'],
    ['approved', '已核准'],
    ['rejected', '已駁回'],
  ]

  it('三值皆顯示中文標籤，無英文 raw', async () => {
    const wrapper = await mountSection(
      CASES.map(([status], i) => overtimeRecord({ id: i + 1, overtime_date: `2026-08-0${i + 1}`, status })),
    )
    const tags = wrapper.findAll('.el-tag').map((t) => t.text())
    for (const [, label] of CASES) expect(tags).toContain(label)
    expect(wrapper.text()).not.toContain('pending')
    expect(wrapper.text()).not.toContain('rejected')
  })

  it('未知狀態 fallback 顯示原值', async () => {
    const wrapper = await mountSection([overtimeRecord({ status: 'weird_status' })])
    expect(wrapper.find('.el-tag').text()).toBe('weird_status')
  })
})

describe('OvertimeSection 合計行（只計已核准）', () => {
  it('合計只納入已核准的時數與加班費', async () => {
    const wrapper = await mountSection([
      overtimeRecord(),
      overtimeRecord({ id: 12, overtime_date: '2026-08-06', hours: 3, overtime_pay: 900, status: 'pending' }),
    ])
    const summary = wrapper.find('.overtime-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('2 小時')
    expect(summary.text()).toContain('NT$500')
    expect(summary.text()).not.toContain('900')
  })

  it('無資料時不顯示合計行', async () => {
    const wrapper = await mountSection([])
    expect(wrapper.find('.overtime-summary').exists()).toBe(false)
  })
})

describe('OvertimeSection 手機 RWD（卡片列表）', () => {
  it('手機版改用卡片列表（AdminListCards）並渲染日期/類型', async () => {
    const wrapper = await mountSection([overtimeRecord()], true)
    expect(wrapper.findAllComponents(AdminListCards)).toHaveLength(1)
    expect(wrapper.text()).toContain('2026-08-05')
    expect(wrapper.text()).toContain('平日加班')
  })

  it('桌機版維持表格、不用卡片', async () => {
    const wrapper = await mountSection([overtimeRecord()], false)
    expect(wrapper.findAllComponents(AdminListCards)).toHaveLength(0)
  })

  it('手機版空資料顯示空狀態文案', async () => {
    const wrapper = await mountSection([], true)
    expect(wrapper.text()).toContain('本月尚無加班紀錄')
  })
})
