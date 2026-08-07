import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import SystemSettingsPanel from '@/views/salary/SystemSettingsPanel.vue'
import { ElMessage } from 'element-plus'

// ── API mocks ────────────────────────────────────────────────────────────────
const listSystemConfigs = vi.fn()
const updateSystemConfig = vi.fn()

vi.mock('@/api/systemConfig', () => ({
  listSystemConfigs: (...a: unknown[]) => listSystemConfigs(...a),
  updateSystemConfig: (...a: unknown[]) => updateSystemConfig(...a),
}))

const hasPermissionMock = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...(a as [string])),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// table 把 data 灌給 column stub，column stub 逐 row 呼叫 default slot（見
// BusRoutesView.test.ts 的既有模式）。
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (props.data as unknown[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row, $index: index }) : []),
        ),
      )
  },
})
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table' },
        (slots.default?.() ?? []).map((vnode, index) =>
          h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
        ),
      )
  },
})

const GLOBAL_STUBS = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-input': {
    props: ['modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event)" />',
  },
  'el-button': {
    props: ['disabled'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-tag': { template: '<span class="el-tag-stub"><slot /></span>' },
  'el-alert': {
    props: ['title'],
    template: '<div class="el-alert-stub">{{ title }}<slot /></div>',
  },
  'el-icon': true,
}

function mountPanel() {
  return mount(SystemSettingsPanel, {
    global: {
      directives: { loading: {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

interface BankConfig {
  config_key: string
  config_value: string
  description?: string
  is_default?: boolean
  _editValue: string
  _dirty: boolean
}
interface SetupState {
  bankConfigs: BankConfig[]
  saveConfig: (row: BankConfig) => Promise<void>
}

const BANK_ITEMS = [
  {
    config_key: 'bank.payer_name',
    config_value: '幼稚園股份有限公司',
    description: '匯款人戶名',
    is_default: false,
  },
  {
    config_key: 'bank.payer_account',
    config_value: '00000000000000',
    description: '匯款帳號',
    is_default: true,
  },
]

function findConfig(wrapper: ReturnType<typeof mountPanel>, key: string): BankConfig {
  const state = wrapper.vm.$.setupState as unknown as SetupState
  const row = state.bankConfigs.find((r) => r.config_key === key)
  if (!row) throw new Error(`row not found: ${key}`)
  return row
}

describe('SystemSettingsPanel — bank.* 銀行轉帳設定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockReturnValue(true)
    listSystemConfigs.mockResolvedValue({ data: { items: BANK_ITEMS } })
    updateSystemConfig.mockResolvedValue({
      data: { config_key: 'bank.payer_name', config_value: '新戶名', is_default: false },
    })
  })

  it('掛載時以 listSystemConfigs("bank") 讀取兩項銀行設定，並顯示預設值標籤', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    expect(listSystemConfigs).toHaveBeenCalledWith('bank')
    const state = wrapper.vm.$.setupState as unknown as SetupState
    expect(state.bankConfigs.map((r) => r.config_key)).toEqual([
      'bank.payer_name',
      'bank.payer_account',
    ])
    expect(wrapper.text()).toContain('預設值（未存 DB）')
  })

  it('修改戶名並儲存後呼叫 updateSystemConfig 並提示成功', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const row = findConfig(wrapper, 'bank.payer_name')
    row._editValue = '新戶名'
    row._dirty = true
    const state = wrapper.vm.$.setupState as unknown as SetupState
    await state.saveConfig(row)
    await flushPromises()

    expect(updateSystemConfig).toHaveBeenCalledWith('bank.payer_name', {
      config_value: '新戶名',
    })
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('canEdit=false（無 SETTINGS_WRITE）時顯示既有的無權限提示，且不渲染儲存按鈕', async () => {
    hasPermissionMock.mockReturnValue(false)

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('目前帳號無系統設定編輯權限')
    expect(wrapper.findAll('button').length).toBe(0)
  })

  it('listSystemConfigs 失敗時顯示錯誤提示', async () => {
    listSystemConfigs.mockRejectedValue(new Error('network error'))

    mountPanel()
    await flushPromises()
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalled()
  })
})
