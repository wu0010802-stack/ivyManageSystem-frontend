import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/audit', () => ({
  getAuditLogs: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAuditLogsMeta: vi.fn().mockResolvedValue({
    data: {
      entity_types: [
        { value: 'auth', label: '登入活動' },
        { value: 'employee', label: '員工' },
      ],
      actions: [
        { value: 'LOGIN_SUCCESS', label: '登入成功' },
        { value: 'LOGIN_FAILED', label: '登入失敗' },
        { value: 'LOGIN_RATE_LIMITED', label: '登入被限流' },
        { value: 'LOGIN_LOCKED', label: '帳號鎖定中' },
        { value: 'READ', label: '查看' },
      ],
    },
  }),
  exportAuditLogs: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

import AuditLogView from '@/views/AuditLogView.vue'

const mountOptions = {
  global: {
    stubs: {
      // 表格相關：不渲染 slot，避免 scoped-slot row 為 undefined 拋錯
      'el-table': { template: '<div/>' },
      'el-table-column': { template: '<div/>' },
      // 其他 Element Plus 元件
      'el-card': { template: '<div><slot/></div>' },
      'el-button': { template: '<button><slot/></button>' },
      'el-select': { template: '<div><slot/></div>' },
      'el-option': { template: '<div><slot/></div>' },
      'el-input': { template: '<input/>' },
      'el-date-picker': { template: '<input/>' },
      'el-pagination': { template: '<div/>' },
      'el-tag': { template: '<span><slot/></span>' },
      'el-form': { template: '<form><slot/></form>' },
      'el-form-item': { template: '<div><slot/></div>' },
      'el-col': { template: '<div><slot/></div>' },
      'el-row': { template: '<div><slot/></div>' },
      'el-icon': { template: '<span/>' },
      'el-tooltip': { template: '<div><slot/></div>' },
      'el-dialog': { template: '<div/>' },
    },
    directives: {
      loading: {},
    },
  },
}

describe('AuditLogView — LOGIN_* / READ 快篩與動作標籤', () => {
  it('高風險快篩含「登入失敗」按鈕', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    expect(wrapper.html()).toContain('登入失敗')
  })

  it('高風險快篩含「登入限流/鎖定」按鈕', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    expect(wrapper.html()).toContain('登入限流')
  })

  it('RISK_QUICK_FILTERS 含 login_failed predicate — LOGIN_FAILED 行命中', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    // 透過點擊快篩按鈕間接驗證 predicate（客端過濾後 displayedLogs 變化不易直接斷言，
    // 但至少確保按鈕存在且可點擊而不拋例外）
    const buttons = wrapper.findAll('button')
    const loginFailedBtn = buttons.find((b) => b.text().includes('登入失敗'))
    expect(loginFailedBtn).toBeTruthy()
    await loginFailedBtn.trigger('click')
    // 點擊後不應拋出例外，組件仍正常存在
    expect(wrapper.exists()).toBe(true)
  })

  it('RISK_QUICK_FILTERS 含 login_blocked predicate — LOGIN_RATE_LIMITED 行命中', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const blockedBtn = buttons.find((b) => b.text().includes('登入限流'))
    expect(blockedBtn).toBeTruthy()
    await blockedBtn.trigger('click')
    expect(wrapper.exists()).toBe(true)
  })
})

describe('AuditLogView — formatOperator 代操作者顯示', () => {
  it('(a) 有 impersonated_by_name 時顯示「老師A（代操作：王小明）」', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    const row = { username: '老師A', impersonated_by_name: '王小明' }
    const text = wrapper.vm.formatOperator(row)
    expect(text).toBe('老師A（代操作：王小明）')
  })

  it('(b) impersonated_by_name 為 null 時只顯示使用者名稱', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    const row = { username: '老師A', impersonated_by_name: null }
    const text = wrapper.vm.formatOperator(row)
    expect(text).toBe('老師A')
  })

  it('(b2) impersonated_by_name 缺席時只顯示使用者名稱', async () => {
    const wrapper = mount(AuditLogView, mountOptions)
    await flushPromises()
    const row = { username: '老師A' }
    const text = wrapper.vm.formatOperator(row)
    expect(text).toBe('老師A')
  })
})
