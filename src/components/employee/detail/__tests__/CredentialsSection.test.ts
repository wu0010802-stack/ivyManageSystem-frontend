import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import CredentialsSection from '../CredentialsSection.vue'

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
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
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

describe('CredentialsSection 到期標籤', () => {
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
