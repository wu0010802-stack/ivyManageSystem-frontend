// src/components/employee/detail/__tests__/AttendanceSection.test.ts
// 出勤子區塊操作權限守衛（finding #2）：出勤編輯/刪除後端守 ATTENDANCE_WRITE，
// 無權限者不應看到逐列「編輯/刪除」操作（避免點下才被 API 拒絕）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import type { VNode } from 'vue'
import AttendanceSection from '../AttendanceSection.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'

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
