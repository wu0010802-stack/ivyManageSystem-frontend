import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import type { VNode } from 'vue'
import CredentialsSection from '../CredentialsSection.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'

// 權限守衛：預設有權限（現有到期標籤測試不受影響）；權限 case 個別覆寫
const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => mockHasPermission(...a),
}))

// 手機/桌機切換：預設桌機
const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile }) }))

// ── 可正確傳遞 row 資料的 el-table / el-table-column stub ──
// 沿用 src/views/activity/__tests__/ActivityAttendanceView.test.ts 既有慣例：
// el-table 把 data prop 轉發給每個 el-table-column 子元件，
// el-table-column 依 data 逐列呼叫 #default scoped slot（scope.row）。
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      (props.data as Record<string, unknown>[]).map((row, index) =>
        h('div', { key: index, class: 'cell' }, slots.default ? slots.default({ row }) : []),
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
      (slots.default?.() || []).map((vnode: VNode, index: number) =>
        h(vnode.type as string, { ...vnode.props, data: props.data, key: index }, vnode.children as never),
      ),
    )
  },
})

const GLOBAL_STUBS = {
  'el-button': { template: '<button><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-tag': { template: '<span class="el-tag" :data-type="type"><slot /></span>', props: ['type'] },
  'el-dialog': { name: 'ElDialog', props: ['fullscreen', 'modelValue', 'width'], template: '<div><slot /><slot name="footer" /></div>' },
  'el-card': { template: '<div class="el-card"><slot /></div>' },
  'el-skeleton': true,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<select><slot /></select>' },
  'el-option': { template: '<option><slot /></option>' },
  'el-date-picker': { template: '<input />' },
  'el-switch': { template: '<input type="checkbox" />' },
  'el-input-number': { template: '<input type="number" />' },
}

// 相對「現在」建構本地日期字串，與元件內 expiryStatus 預設 today=new Date() 對齊；
// 直接組本地年月日字串，避免 new Date(str) 被當 UTC 解析造成偏移。
function localISOOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const baseProps = { employeeId: 1, educations: [], certificates: [], contracts: [] }

describe('CredentialsSection 操作權限守衛（EMPLOYEES_WRITE）', () => {
  beforeEach(() => { mockHasPermission.mockReset(); mockHasPermission.mockReturnValue(true) })

  it('以 EMPLOYEES_WRITE 查詢權限', () => {
    mount(CredentialsSection, { props: { ...baseProps }, global: { stubs: GLOBAL_STUBS } })
    expect(mockHasPermission).toHaveBeenCalledWith('EMPLOYEES_WRITE')
  })

  it('有權限 → 顯示新增與逐列編輯/刪除操作', () => {
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(CredentialsSection, {
      props: { ...baseProps, certificates: [{ id: 1, certificate_name: 'X', expiry_date: null }] },
      global: { stubs: GLOBAL_STUBS },
    })
    expect(wrapper.text()).toContain('新增學歷')
    expect(wrapper.text()).toContain('新增證照')
    expect(wrapper.text()).toContain('新增合約')
    expect(wrapper.text()).toContain('編輯')
    expect(wrapper.text()).toContain('刪除')
  })

  it('無權限 → 不顯示新增按鈕與逐列編輯/刪除操作', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mount(CredentialsSection, {
      props: { ...baseProps, certificates: [{ id: 1, certificate_name: 'X', expiry_date: null }] },
      global: { stubs: GLOBAL_STUBS },
    })
    expect(wrapper.text()).not.toContain('新增學歷')
    expect(wrapper.text()).not.toContain('新增證照')
    expect(wrapper.text()).not.toContain('新增合約')
    expect(wrapper.text()).not.toContain('編輯')
    expect(wrapper.text()).not.toContain('刪除')
  })
})

describe('CredentialsSection 手機 RWD（子對話框 fullscreen）', () => {
  beforeEach(() => { mockHasPermission.mockReturnValue(true); mockIsMobile.value = false })

  it('手機版子對話框採 fullscreen', () => {
    mockIsMobile.value = true
    const wrapper = mount(CredentialsSection, { props: { ...baseProps }, global: { stubs: GLOBAL_STUBS } })
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('fullscreen')).toBe(true)
  })

  it('桌機版子對話框非 fullscreen', () => {
    mockIsMobile.value = false
    const wrapper = mount(CredentialsSection, { props: { ...baseProps }, global: { stubs: GLOBAL_STUBS } })
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('fullscreen')).toBe(false)
  })

  it('手機版學歷/證照/合約改用卡片列表（AdminListCards ×3），不用多欄表格', () => {
    mockIsMobile.value = true
    const wrapper = mount(CredentialsSection, { props: { ...baseProps }, global: { stubs: GLOBAL_STUBS } })
    expect(wrapper.findAllComponents(AdminListCards)).toHaveLength(3)
  })

  it('桌機版維持多欄表格，不渲染卡片', () => {
    mockIsMobile.value = false
    const wrapper = mount(CredentialsSection, { props: { ...baseProps }, global: { stubs: GLOBAL_STUBS } })
    expect(wrapper.findAllComponents(AdminListCards)).toHaveLength(0)
  })

  it('手機版證照卡片保留到期 tag 與（有權限時）編輯/刪除操作', () => {
    mockIsMobile.value = true
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(CredentialsSection, {
      props: { ...baseProps, certificates: [{ id: 1, certificate_name: 'X', expiry_date: localISOOffset(-1) }] },
      global: { stubs: GLOBAL_STUBS },
    })
    const danger = wrapper.find('.el-tag[data-type="danger"]')
    expect(danger.exists()).toBe(true)
    expect(danger.text()).toBe('已逾期')
    expect(wrapper.text()).toContain('編輯')
    expect(wrapper.text()).toContain('刪除')
  })

  it('手機版無權限 → 卡片不顯示編輯/刪除操作', () => {
    mockIsMobile.value = true
    mockHasPermission.mockReturnValue(false)
    const wrapper = mount(CredentialsSection, {
      props: { ...baseProps, certificates: [{ id: 1, certificate_name: 'X', expiry_date: null }] },
      global: { stubs: GLOBAL_STUBS },
    })
    expect(wrapper.text()).not.toContain('編輯')
    expect(wrapper.text()).not.toContain('刪除')
  })
})

describe('CredentialsSection 到期標籤', () => {
  beforeEach(() => { mockHasPermission.mockReset(); mockHasPermission.mockReturnValue(true) })

  it('證照到期日已逾期 → danger tag「已逾期」', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        certificates: [{ id: 1, certificate_name: 'X', expiry_date: localISOOffset(-1) }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    const tag = wrapper.find('.el-tag[data-type="danger"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('已逾期')
  })

  it('證照到期日 15 天後到期 → warning tag「15 天後到期」', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        certificates: [{ id: 1, certificate_name: 'X', expiry_date: localISOOffset(15) }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    const tag = wrapper.find('.el-tag[data-type="warning"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('15 天後到期')
  })

  it('證照到期日超過 30 天 → 純日期文字，不掛 tag', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        certificates: [{ id: 1, certificate_name: 'X', expiry_date: localISOOffset(60) }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    expect(wrapper.find('.el-tag[data-type="danger"]').exists()).toBe(false)
    expect(wrapper.find('.el-tag[data-type="warning"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(localISOOffset(60))
  })

  it('證照無到期日 → 既有「永久」info tag 不變', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        certificates: [{ id: 1, certificate_name: 'X', expiry_date: null }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    const tag = wrapper.find('.el-tag[data-type="info"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('永久')
  })

  it('合約結束日已逾期 → danger tag「已逾期」', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        contracts: [{ id: 1, contract_type: '正式', end_date: localISOOffset(-3) }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    const tag = wrapper.find('.el-tag[data-type="danger"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('已逾期')
  })

  it('合約結束日 5 天後到期 → warning tag「5 天後到期」', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        contracts: [{ id: 1, contract_type: '正式', end_date: localISOOffset(5) }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    const tag = wrapper.find('.el-tag[data-type="warning"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('5 天後到期')
  })

  it('合約無結束日 → 既有「未定」info tag 不變', () => {
    const wrapper = mount(CredentialsSection, {
      props: {
        ...baseProps,
        contracts: [{ id: 1, contract_type: '正式', end_date: null }],
      },
      global: { stubs: GLOBAL_STUBS },
    })
    const tag = wrapper.find('.el-tag[data-type="info"]')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('未定')
  })
})
