import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SettingsTenantConfigTab from '@/components/settings/SettingsTenantConfigTab.vue'
import { ElMessage } from 'element-plus'

// ── API mocks ────────────────────────────────────────────────────────────────
const getSystemConfig = vi.fn()
const updateSystemConfig = vi.fn()

vi.mock('@/api/systemConfig', () => ({
  getSystemConfig: (...a: unknown[]) => getSystemConfig(...a),
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

const GLOBAL_STUBS = {
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-input': {
    props: ['modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-switch': {
    props: ['modelValue'],
    template:
      '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
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
  return shallowMount(SettingsTenantConfigTab, {
    global: {
      directives: { loading: {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

interface ConfigRow {
  key: string
  config_value: string
  is_default: boolean
  loadError: boolean
  _editValue: string
  _editBool: boolean
}
interface ConfigSection {
  title: string
  rows: ConfigRow[]
}
interface SetupState {
  sections: ConfigSection[]
  saveConfig: (row: ConfigRow) => Promise<void>
}

/** 新租戶預設情境：全部 10 個非 bank 的 onboarding key 皆尚未設定（GET 單筆一律 404）。 */
function mock404All() {
  getSystemConfig.mockImplementation(() =>
    Promise.reject({ response: { status: 404 } }),
  )
}

function findRow(wrapper: ReturnType<typeof mountPanel>, key: string): ConfigRow {
  const state = wrapper.vm.$.setupState as unknown as SetupState
  for (const section of state.sections) {
    const row = section.rows.find((r) => r.key === key)
    if (row) return row
  }
  throw new Error(`row not found: ${key}`)
}

describe('SettingsTenantConfigTab — 12 項（onboarding 非 bank 10 項 + POS 門檻 2 項）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockReturnValue(true)
    updateSystemConfig.mockResolvedValue({
      data: { config_key: 'x', config_value: 'true', is_default: false },
    })
  })

  it('GET 單筆 404（尚未設定）視為空白可編輯列，不當成錯誤 toast', async () => {
    mock404All()

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const row = findRow(wrapper, 'org_name')
    expect(row.is_default).toBe(true)
    expect(row.loadError).toBe(false)
    expect(row._editValue).toBe('')

    // 全部 12 項皆 404，仍不得觸發「載入失敗」錯誤 toast
    expect(ElMessage.error).not.toHaveBeenCalled()
    // 畫面上要看到「尚未設定」標籤，而非錯誤提示
    expect(wrapper.text()).toContain('尚未設定')
    expect(wrapper.text()).not.toContain('載入失敗')
  })

  it('不包含 bank.* 欄位（銀行轉帳設定留在薪資設定頁）', async () => {
    mock404All()

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const state = wrapper.vm.$.setupState as unknown as SetupState
    const allKeys = state.sections.flatMap((s) => s.rows.map((r) => r.key))
    expect(allKeys).not.toContain('bank.payer_name')
    expect(allKeys).not.toContain('bank.payer_account')
    // 凍結清單守衛：維持精確數字（不可放寬成 >=，否則誤刪欄位不會紅）。
    // 12 ＝ 10 項 onboarding 必填（12 項扣掉留在薪資設定頁的 bank.* 兩項）
    //      ＋ 2 項 POS 現金門檻（選填，2026-08-14 P3-17 借用同一 tab 維護）。
    // ⚠ 後端 KNOWN_DEFAULTS 另有第三個 POS key（pos.operator_daily_refund_threshold），
    //   刻意不進前端 SYSTEM_CONFIG_SECTIONS，故此處仍是 12。
    expect(allKeys).toHaveLength(12)
  })

  it('GET 單筆非 404 錯誤（如 5xx）標記為載入失敗並提示重新整理', async () => {
    getSystemConfig.mockImplementation((key: string) => {
      if (key === 'org_name') {
        return Promise.reject({ response: { status: 500 } })
      }
      return Promise.reject({ response: { status: 404 } })
    })

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const row = findRow(wrapper, 'org_name')
    expect(row.loadError).toBe(true)
    expect(ElMessage.error).toHaveBeenCalled()
    expect(wrapper.text()).toContain('載入失敗')
  })

  it('開關型設定讀取時把舊 token 正規化為 boolean，儲存時一律寫回正規化的 true/false', async () => {
    getSystemConfig.mockImplementation((key: string) => {
      if (key === 'consent.enforcement_enabled') {
        // 歷史殘留 token 變體：大寫 YES，仍應正規化為 true
        return Promise.resolve({ data: { config_value: 'YES', is_default: false } })
      }
      return Promise.reject({ response: { status: 404 } })
    })

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const row = findRow(wrapper, 'consent.enforcement_enabled')
    expect(row._editBool).toBe(true) // 顯示時已正規化

    // 使用者關閉開關後儲存
    row._editBool = false
    const state = wrapper.vm.$.setupState as unknown as SetupState
    await state.saveConfig(row)
    await flushPromises()

    expect(updateSystemConfig).toHaveBeenCalledWith('consent.enforcement_enabled', {
      config_value: 'false',
    })
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('開關型從未設定（404）轉為開啟並儲存時，送出正規化的 "true"（非 1/yes 等變體）', async () => {
    mock404All()

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const row = findRow(wrapper, 'leave.ot_offset_enabled')
    expect(row._editBool).toBe(false) // 未設定視為 false

    row._editBool = true
    const state = wrapper.vm.$.setupState as unknown as SetupState
    await state.saveConfig(row)
    await flushPromises()

    expect(updateSystemConfig).toHaveBeenCalledWith('leave.ot_offset_enabled', {
      config_value: 'true',
    })
  })

  it('IP 白名單欄位輸入 JSON 陣列格式時顯示 inline 警示，逗號分隔格式不顯示', async () => {
    mock404All()

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    const row = findRow(wrapper, 'kiosk.allowed_ips')

    // 逗號分隔（正確格式）：不顯示警示
    row._editValue = '127.0.0.1/32,192.168.0.0/16'
    await nextTick()
    expect(wrapper.text()).not.toContain('不要用 JSON 陣列格式')

    // JSON 陣列格式（誤用）：顯示警示文字
    row._editValue = '["127.0.0.1/32","192.168.0.0/16"]'
    await nextTick()
    expect(wrapper.text()).toContain('請用逗號分隔字串，不要用 JSON 陣列格式')
  })

  it('canEdit=false（無 SETTINGS_WRITE）時顯示既有的無權限提示，且不渲染儲存按鈕', async () => {
    hasPermissionMock.mockReturnValue(false)
    mock404All()

    const wrapper = mountPanel()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('目前帳號無系統設定編輯權限')
    expect(wrapper.findAll('button').length).toBe(0)
  })
})
