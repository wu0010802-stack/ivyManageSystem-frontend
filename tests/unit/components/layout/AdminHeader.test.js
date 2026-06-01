import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminHeader from '@/components/layout/AdminHeader.vue'

// ── Mocks ────────────────────────────────────────────────────────────────────

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ meta: {} }),
  useRouter: () => ({ push }),
}))

const mockImpersonate = vi.fn()
vi.mock('@/api/auth', () => ({
  impersonate: (...args) => mockImpersonate(...args),
  getUserInfo: () => null,
  clearAuth: vi.fn(),
  setUserInfo: vi.fn(),
}))

const mockHasPermission = vi.fn()
const mockGetUserInfo = vi.fn()
const mockSetUserInfo = vi.fn()
const mockClearAuth = vi.fn()

vi.mock('@/utils/auth', () => ({
  getUserInfo: (...args) => mockGetUserInfo(...args),
  setUserInfo: (...args) => mockSetUserInfo(...args),
  clearAuth: (...args) => mockClearAuth(...args),
  hasPermission: (...args) => mockHasPermission(...args),
  PERMISSION_NAMES: {},
}))

const fetchEmployees = vi.fn().mockResolvedValue(undefined)
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({
    fetchEmployees,
    employees: [
      { id: 1, name: '王小明', employee_id: 'E001', job_title: '老師' },
      { id: 2, name: '李小花', employee_id: 'E002', job_title: '助教' },
    ],
  }),
}))

// Stub heavy child components
const globalStubs = {
  GlobalSearch: { template: '<div />', methods: { open: vi.fn() } },
  AdminNotificationBell: { template: '<div />' },
  A11yMenu: { template: '<div />' },
  'el-header': { template: '<div><slot /></div>' },
  'el-button': {
    props: ['type', 'size', 'plain', 'icon', 'title'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  },
  'el-icon': { template: '<span><slot /></span>' },
  'el-avatar': { template: '<span />' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<ul><slot /></ul>' },
  'el-dropdown-item': { template: '<li><slot /></li>' },
  'el-input': { template: '<input />' },
  'el-scrollbar': { template: '<div><slot /></div>' },
  'el-radio-group': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="el-radio-group"><slot /></div>',
    setup(props, { emit }) {
      return {
        onChange: (val) => emit('update:modelValue', val),
      }
    },
  },
  'el-radio': {
    props: ['label'],
    template: '<label class="el-radio" :data-label="label" @click="$emit(\'click\')"><slot /></label>',
    emits: ['click'],
  },
  'el-radio-button': {
    props: ['label'],
    template: '<label class="el-radio-button" :data-label="label" @click="$emit(\'click\')"><slot /></label>',
    emits: ['click'],
  },
  // Passthrough el-dialog：允許 jsdom 看到 dialog 內容
  'el-dialog': {
    props: ['modelValue', 'title', 'width', 'appendToBody'],
    emits: ['update:modelValue'],
    template: '<div class="el-dialog-stub"><div class="el-dialog-body" v-if="modelValue"><slot /></div></div>',
  },
}

// admin 身份（無 employee_id → 超管，需選員工）
function adminUserInfo() {
  return { name: 'Admin', role: 'admin', employee_id: null, permission_names: ['*'] }
}

// 開啟 employee picker
async function openPicker(wrapper) {
  // 找「進入前台」按鈕（data-testid 或 text）
  const btns = wrapper.findAll('button')
  const portalBtn = btns.find((b) => b.text().includes('進入前台'))
  expect(portalBtn).toBeTruthy()
  await portalBtn.trigger('click')
  await flushPromises()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminHeader — 進入前台模式選擇', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserInfo.mockReturnValue(adminUserInfo())
    mockImpersonate.mockResolvedValue({ data: { user: { name: 'Test', role: 'teacher' } } })
    fetchEmployees.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── (a) 出現預覽 / 代操作選項 ────────────────────────────────────────────

  it('(a) 打開選身份 dialog 後，出現模式選擇（預覽 / 代操作）', async () => {
    // 具有 PORTAL_IMPERSONATE 權限
    mockHasPermission.mockReturnValue(true)

    const wrapper = mount(AdminHeader, {
      global: { stubs: globalStubs },
    })

    await openPicker(wrapper)

    const dialogBody = wrapper.find('.el-dialog-body')
    expect(dialogBody.exists()).toBe(true)
    const text = dialogBody.text()
    expect(text).toContain('預覽')
    expect(text).toContain('代操作')
  })

  // ── (b) 無 PORTAL_IMPERSONATE 權限時，只見「預覽」 ──────────────────────

  it('(b) 無 PORTAL_IMPERSONATE 權限（如園長）時，dialog 只顯示「預覽」，不顯示「代操作」', async () => {
    // 無 PORTAL_IMPERSONATE
    mockHasPermission.mockImplementation((perm) => perm !== 'PORTAL_IMPERSONATE')

    const wrapper = mount(AdminHeader, {
      global: { stubs: globalStubs },
    })

    await openPicker(wrapper)

    const dialogBody = wrapper.find('.el-dialog-body')
    expect(dialogBody.exists()).toBe(true)
    const text = dialogBody.text()
    expect(text).toContain('預覽')
    expect(text).not.toContain('代操作')
  })

  // ── (c) 選 readonly（預設）→ impersonate(empId, 'readonly') ─────────────

  it('(c) 預設模式為 readonly，點選員工後呼叫 impersonate(empId, "readonly")', async () => {
    mockHasPermission.mockReturnValue(true)

    const wrapper = mount(AdminHeader, {
      global: { stubs: globalStubs },
    })

    await openPicker(wrapper)

    // 點第一個員工
    const empItems = wrapper.findAll('.emp-picker-item')
    expect(empItems.length).toBeGreaterThan(0)
    await empItems[0].trigger('click')
    await flushPromises()

    expect(mockImpersonate).toHaveBeenCalledTimes(1)
    expect(mockImpersonate).toHaveBeenCalledWith(1, 'readonly')
  })

  // ── (c) 選 write → impersonate(empId, 'write') ──────────────────────────

  it('(c) 選「代操作」模式後，點選員工呼叫 impersonate(empId, "write")', async () => {
    mockHasPermission.mockReturnValue(true)

    const wrapper = mount(AdminHeader, {
      global: { stubs: globalStubs },
    })

    await openPicker(wrapper)

    // 確認「代操作」radio 存在（行為 b 的正面）
    const writeRadio = wrapper.findAll('.el-radio').find((r) => r.attributes('data-label') === 'write')
    expect(writeRadio).toBeTruthy()

    // 直接設定 vm 上的 selectedMode 為 'write'（stub 無法真正更新 v-model；
    // 這裡測試的核心邏輯是 doImpersonate 是否帶正確 mode 呼叫 impersonate）
    wrapper.vm.selectedMode = 'write'
    await flushPromises()

    // 點第一個員工
    const empItems = wrapper.findAll('.emp-picker-item')
    expect(empItems.length).toBeGreaterThan(0)
    await empItems[0].trigger('click')
    await flushPromises()

    expect(mockImpersonate).toHaveBeenCalledTimes(1)
    expect(mockImpersonate).toHaveBeenCalledWith(1, 'write')
  })

  // ── 安全守衛：無權限時強制 readonly ──────────────────────────────────────

  it('(安全守衛) 即使 selectedMode 為 write，無 PORTAL_IMPERSONATE 時仍以 readonly 呼叫', async () => {
    // 無 PORTAL_IMPERSONATE 權限
    mockHasPermission.mockImplementation((perm) => perm !== 'PORTAL_IMPERSONATE')

    const wrapper = mount(AdminHeader, {
      global: { stubs: globalStubs },
    })

    await openPicker(wrapper)

    // 強制設 selectedMode = 'write'（模擬繞過 UI 的情境）
    wrapper.vm.selectedMode = 'write'
    await flushPromises()

    const empItems = wrapper.findAll('.emp-picker-item')
    await empItems[0].trigger('click')
    await flushPromises()

    expect(mockImpersonate).toHaveBeenCalledTimes(1)
    // 守衛：無 PORTAL_IMPERSONATE 應強制使用 readonly
    expect(mockImpersonate).toHaveBeenCalledWith(1, 'readonly')
  })
})
