// src/components/employee/detail/__tests__/AttendanceSection.test.ts
// 出勤子區塊操作權限守衛（finding #2）：出勤編輯/刪除後端守 ATTENDANCE_WRITE，
// 無權限者不應看到逐列「編輯/刪除」操作（避免點下才被 API 拒絕）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import type { VNode } from 'vue'
import AttendanceSection from '../AttendanceSection.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { getRecords } from '@/api/attendance'

vi.mock('@/api/attendance', () => ({
  getRecords: vi.fn().mockResolvedValue({
    data: [{ date: '2026-07-01', weekday: '三', punch_in: '08:00', punch_out: '17:00', status: 'normal' }],
  }),
  uploadCsv: vi.fn(),
  deleteEmployeeDateRecord: vi.fn(),
}))

const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => mockHasPermission(...a),
}))

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile }) }))

// el-table 逐列轉發 data 給 column，column 依 data 呼叫 #default(scope.row)（同 CredentialsSection 慣例）
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
  'el-button': { template: '<button><slot /></button>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type'] },
  'el-date-picker': { template: '<input />' },
  'el-card': { template: '<div class="el-card"><slot /></div>' },
  'el-skeleton': true,
}

async function mountSection() {
  const wrapper = mount(AttendanceSection, {
    props: { employee: { id: 1, employee_id: 'EMP001', name: '王小明' } },
    global: { stubs: GLOBAL_STUBS },
  })
  await flushPromises()
  return wrapper
}

describe('AttendanceSection 操作權限守衛（ATTENDANCE_WRITE）', () => {
  beforeEach(() => { mockHasPermission.mockReset(); mockHasPermission.mockReturnValue(true); mockIsMobile.value = false })

  it('以 ATTENDANCE_WRITE 查詢權限', async () => {
    await mountSection()
    expect(mockHasPermission).toHaveBeenCalledWith('ATTENDANCE_WRITE')
  })

  it('有權限 → 顯示逐列編輯/刪除', async () => {
    mockHasPermission.mockReturnValue(true)
    const wrapper = await mountSection()
    expect(wrapper.text()).toContain('編輯')
    expect(wrapper.text()).toContain('刪除')
  })

  it('無權限 → 不顯示逐列編輯/刪除', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = await mountSection()
    expect(wrapper.text()).not.toContain('編輯')
    expect(wrapper.text()).not.toContain('刪除')
  })
})

describe('AttendanceSection 手機 RWD（卡片列表）', () => {
  beforeEach(() => { mockHasPermission.mockReset(); mockHasPermission.mockReturnValue(true); mockIsMobile.value = false })

  it('手機版出勤改用卡片列表（AdminListCards），不用多欄表格', async () => {
    mockIsMobile.value = true
    const wrapper = await mountSection()
    expect(wrapper.findAllComponents(AdminListCards)).toHaveLength(1)
  })

  it('桌機版維持出勤表格', async () => {
    mockIsMobile.value = false
    const wrapper = await mountSection()
    expect(wrapper.findAllComponents(AdminListCards)).toHaveLength(0)
  })

  it('手機版卡片保留狀態 tag 與（有權限時）編輯/刪除', async () => {
    mockIsMobile.value = true
    mockHasPermission.mockReturnValue(true)
    const wrapper = await mountSection()
    expect(wrapper.find('.el-tag').exists()).toBe(true)
    expect(wrapper.text()).toContain('編輯')
    expect(wrapper.text()).toContain('刪除')
  })
})

// #10：出勤狀態原為英文 raw（normal/late/early_leave/late+early_leave）直接渲染，
// 一般使用者看不懂。改中文對照（fallback 顯示原值），桌機表格與手機卡片兩渲染點都套。
describe('AttendanceSection 出勤狀態中文化', () => {
  const mockGetRecords = getRecords as unknown as ReturnType<typeof vi.fn>
  const CASES: [string, string][] = [
    ['normal', '正常'],
    ['late', '遲到'],
    ['early_leave', '早退'],
    ['late+early_leave', '遲到+早退'],
  ]

  function recordsFor(statuses: string[]) {
    return statuses.map((s, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      weekday: '三', punch_in: '08:00', punch_out: '17:00', status: s,
    }))
  }

  async function mountWith(statuses: string[], mobile = false) {
    mockGetRecords.mockResolvedValueOnce({ data: recordsFor(statuses) })
    mockIsMobile.value = mobile
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(AttendanceSection, {
      props: { employee: { id: 1, employee_id: 'EMP001', name: '王小明' } },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => { mockGetRecords.mockReset(); mockHasPermission.mockReset(); mockIsMobile.value = false })

  it('桌機表格：四值皆顯示中文標籤，無英文 raw', async () => {
    const wrapper = await mountWith(CASES.map((c) => c[0]))
    const tags = wrapper.findAll('.el-tag').map((t) => t.text())
    for (const [, label] of CASES) expect(tags).toContain(label)
    expect(wrapper.text()).not.toContain('early_leave')
    expect(wrapper.text()).not.toContain('normal')
  })

  it('桌機表格：未知狀態 fallback 顯示原值', async () => {
    const wrapper = await mountWith(['weird_status'])
    expect(wrapper.find('.el-tag').text()).toBe('weird_status')
  })

  it('手機卡片：四值皆顯示中文標籤，無英文 raw', async () => {
    const wrapper = await mountWith(CASES.map((c) => c[0]), true)
    const tags = wrapper.findAll('.el-tag').map((t) => t.text())
    for (const [, label] of CASES) expect(tags).toContain(label)
    expect(wrapper.text()).not.toContain('early_leave')
  })
})
