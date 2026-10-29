import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SettingsTenantConfigTab from '@/components/settings/SettingsTenantConfigTab.vue'
import type { SystemConfigPlacement } from '@/constants/onboardingSystemConfigs'
import { ElMessage } from 'element-plus'

// ── API mocks ────────────────────────────────────────────────────────────────
const getSystemConfig = vi.fn()
const updateSystemConfig = vi.fn()

vi.mock('@/api/systemConfig', () => ({
  getSystemConfig: (...a: unknown[]) => getSystemConfig(...a),
  updateSystemConfig: (...a: unknown[]) => updateSystemConfig(...a),
}))

const hasPermissionMock = vi.fn()
const isSuperAdminMock = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...(a as [string])),
  isSuperAdmin: () => isSuperAdminMock(),
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

function mountPanel(placement?: SystemConfigPlacement) {
  return shallowMount(SettingsTenantConfigTab, {
    props: placement ? { placement } : {},
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

// 2026-10-29（後台 IA 重整 S5）：同一元件依 placement 只渲染所屬區塊——
//   settings（預設）＝機構全名、家長同意書；attendance＝Kiosk／校內 WiFi；gov＝三組單位編號；
//   activity＝POS 現金門檻；salary＝薪資／請假／加班規則 5 項＋加班抵休。校車座標已移到 /bus/settings。
describe('SettingsTenantConfigTab — 依 placement 渲染所屬區塊', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockReturnValue(true)
    isSuperAdminMock.mockReturnValue(true)
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

    // 全部皆 404，仍不得觸發「載入失敗」錯誤 toast
    expect(ElMessage.error).not.toHaveBeenCalled()
    // 畫面上要看到「尚未設定」標籤，而非錯誤提示
    expect(wrapper.text()).toContain('尚未設定')
    expect(wrapper.text()).not.toContain('載入失敗')
  })

  const PLACEMENT_KEYS: Record<SystemConfigPlacement, string[]> = {
    settings: ['org_name', 'consent.enforcement_enabled'],
    attendance: ['kiosk.allowed_ips', 'auth.school_wifi_ips'],
    gov: [
      'gov.labor_insurance_unit_code',
      'gov.health_insurance_unit_code',
      'gov.pension_employer_code',
    ],
    activity: ['pos.cash_count_required_threshold', 'pos.cash_deposit_warning_threshold'],
    salary: [
      'festival_target.effective_ym',
      'leave_quota_year_basis',
      'overtime.block_on_partial_leave_day',
      'year_end.exclude_maternity_months',
      'festival.unsigned_cutoff_hire_date',
      'leave.ot_offset_enabled',
    ],
  }

  it.each(Object.entries(PLACEMENT_KEYS) as [SystemConfigPlacement, string[]][])(
    'placement=%s 只讀取並渲染自己的 key（逐 key GET，凍結清單守衛）',
    async (placement, keys) => {
      mock404All()

      const wrapper = mountPanel(placement)
      await flushPromises()
      await nextTick()

      const state = wrapper.vm.$.setupState as unknown as SetupState
      const rendered = state.sections.flatMap((s) => s.rows.map((r) => r.key))
      expect(rendered).toEqual(keys)
      expect(getSystemConfig.mock.calls.map((c) => c[0] as string).sort()).toEqual([...keys].sort())
    },
  )

  it('不包含 bank.*（留在薪資設定頁）與 bus.*（已移到 /bus/settings）；五個位置合計 15 項', async () => {
    mock404All()

    const allKeys: string[] = []
    for (const placement of Object.keys(PLACEMENT_KEYS) as SystemConfigPlacement[]) {
      const wrapper = mountPanel(placement)
      await flushPromises()
      await nextTick()
      const state = wrapper.vm.$.setupState as unknown as SetupState
      allKeys.push(...state.sections.flatMap((s) => s.rows.map((r) => r.key)))
    }
    expect(allKeys.some((k) => k.startsWith('bank.'))).toBe(false)
    expect(allKeys.some((k) => k.startsWith('bus.'))).toBe(false)
    // 精確數字（不可放寬成 >=，否則誤刪欄位不會紅）。
    // 15 ＝ 8 項 onboarding（12 項扣掉 bank.* 兩項留在薪資設定頁、bus.* 兩項在 /bus/settings）
    //      ＋ 2 項 POS 現金門檻（選填，2026-08-14 P3-17）
    //      ＋ 5 項「薪資／請假／加班規則」（選填，2026-10-23 義華第二批裁定）。
    // ⚠ 後端 KNOWN_DEFAULTS 另有第三個 POS key（pos.operator_daily_refund_threshold），
    //   刻意不進前端 SYSTEM_CONFIG_SECTIONS。
    expect(allKeys).toHaveLength(15)
    expect(new Set(allKeys).size).toBe(15)
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

    const wrapper = mountPanel('salary')
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

    const wrapper = mountPanel('attendance')
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

  describe('內控／安全邊界 key 需超級管理員（後端 INTERNAL_CONTROL_CONFIG_KEYS，稽核 F22）', () => {
    // 四個內控 key 分散在三個位置：settings／attendance／salary
    const SUPER_KEYS_BY_PLACEMENT: [SystemConfigPlacement, string[]][] = [
      ['settings', ['consent.enforcement_enabled']],
      ['attendance', ['kiosk.allowed_ips', 'auth.school_wifi_ips']],
      ['salary', ['leave.ot_offset_enabled']],
    ]

    it.each(SUPER_KEYS_BY_PLACEMENT)(
      '有 SETTINGS_WRITE 但非超級管理員（%s）：內控 key 唯讀並提示「需超級管理員」',
      async (placement, keys) => {
        isSuperAdminMock.mockReturnValue(false)
        mock404All()

        const wrapper = mountPanel(placement)
        await flushPromises()
        await nextTick()

        for (const key of keys) {
          const rowEl = wrapper.find(`[data-test="config-row-${key}"]`)
          expect(rowEl.exists(), key).toBe(true)
          expect(rowEl.text(), key).toContain('需超級管理員')
          expect(rowEl.find('input').attributes('disabled'), key).toBeDefined()
          expect(rowEl.findAll('button'), key).toHaveLength(0)
        }
      },
    )

    it('同一位置內非內控的欄位照常可編輯（settings 的機構全名）', async () => {
      isSuperAdminMock.mockReturnValue(false)
      mock404All()

      const wrapper = mountPanel()
      await flushPromises()
      await nextTick()

      const orgRow = wrapper.find('[data-test="config-row-org_name"]')
      expect(orgRow.text()).not.toContain('需超級管理員')
      expect(orgRow.find('input').attributes('disabled')).toBeUndefined()
      expect(orgRow.findAll('button').length).toBeGreaterThan(0)
    })

    it('非超級管理員即使繞過 UI 呼叫 saveConfig，也不送出內控 key 的 PUT', async () => {
      isSuperAdminMock.mockReturnValue(false)
      mock404All()

      const wrapper = mountPanel()
      await flushPromises()
      await nextTick()

      const row = findRow(wrapper, 'consent.enforcement_enabled')
      row._editBool = true
      const state = wrapper.vm.$.setupState as unknown as SetupState
      await state.saveConfig(row)
      await flushPromises()

      expect(updateSystemConfig).not.toHaveBeenCalled()
    })

    it('超級管理員：不顯示「需超級管理員」提示，可編輯', async () => {
      mock404All()

      const wrapper = mountPanel('attendance')
      await flushPromises()
      await nextTick()

      expect(wrapper.text()).not.toContain('需超級管理員')
      const rowEl = wrapper.find('[data-test="config-row-kiosk.allowed_ips"]')
      expect(rowEl.find('input').attributes('disabled')).toBeUndefined()
    })
  })

  describe('金流簽核 key 需 ACTIVITY_PAYMENT_APPROVE（後端 FINANCE_CONTROLLED_CONFIG_KEYS）', () => {
    // 有 SETTINGS_WRITE、沒有金流簽核：後端會 403，所以搬進模組頁後前端就不給編輯
    const noFinance = () =>
      hasPermissionMock.mockImplementation((p: string) => p !== 'ACTIVITY_PAYMENT_APPROVE')

    it('activity：POS 兩個門檻唯讀並提示「需金流簽核權限」', async () => {
      noFinance()
      mock404All()

      const wrapper = mountPanel('activity')
      await flushPromises()
      await nextTick()

      for (const key of ['pos.cash_count_required_threshold', 'pos.cash_deposit_warning_threshold']) {
        const rowEl = wrapper.find(`[data-test="config-row-${key}"]`)
        expect(rowEl.text(), key).toContain('需金流簽核權限')
        expect(rowEl.find('input').attributes('disabled'), key).toBeDefined()
        expect(rowEl.findAll('button'), key).toHaveLength(0)
      }
    })

    it('salary：算錢口徑 4 個 key 唯讀；半日假加班與加班抵休（超級管理員）不受金流簽核影響', async () => {
      noFinance()
      mock404All()

      const wrapper = mountPanel('salary')
      await flushPromises()
      await nextTick()

      for (const key of [
        'festival_target.effective_ym',
        'leave_quota_year_basis',
        'year_end.exclude_maternity_months',
        'festival.unsigned_cutoff_hire_date',
      ]) {
        const rowEl = wrapper.find(`[data-test="config-row-${key}"]`)
        expect(rowEl.text(), key).toContain('需金流簽核權限')
        expect(rowEl.findAll('button'), key).toHaveLength(0)
      }
      // overtime.block_on_partial_leave_day：後端只要 SETTINGS_WRITE，不在 FINANCE_CONTROLLED_CONFIG_KEYS
      const otRow = wrapper.find('[data-test="config-row-overtime.block_on_partial_leave_day"]')
      expect(otRow.text()).not.toContain('需金流簽核權限')
      expect(otRow.find('input').attributes('disabled')).toBeUndefined()
      // leave.ot_offset_enabled：內控 key，超級管理員即可，不要求金流簽核
      const offsetRow = wrapper.find('[data-test="config-row-leave.ot_offset_enabled"]')
      expect(offsetRow.text()).not.toContain('需金流簽核權限')
      expect(offsetRow.find('input').attributes('disabled')).toBeUndefined()
    })

    it('沒有金流簽核即使繞過 UI 呼叫 saveConfig，也不送出 PUT', async () => {
      noFinance()
      mock404All()

      const wrapper = mountPanel('activity')
      await flushPromises()
      await nextTick()

      const row = findRow(wrapper, 'pos.cash_count_required_threshold')
      row._editValue = '99999999'
      const state = wrapper.vm.$.setupState as unknown as SetupState
      await state.saveConfig(row)
      await flushPromises()

      expect(updateSystemConfig).not.toHaveBeenCalled()
    })

    it('具備金流簽核：POS 門檻可編輯並送出 PUT', async () => {
      mock404All()

      const wrapper = mountPanel('activity')
      await flushPromises()
      await nextTick()

      const row = findRow(wrapper, 'pos.cash_count_required_threshold')
      row._editValue = '5000'
      const state = wrapper.vm.$.setupState as unknown as SetupState
      await state.saveConfig(row)
      await flushPromises()

      expect(updateSystemConfig).toHaveBeenCalledWith('pos.cash_count_required_threshold', {
        config_value: '5000',
      })
    })

    it('settings／attendance／gov 位置不出現「需金流簽核權限」', async () => {
      noFinance()
      mock404All()

      for (const placement of ['settings', 'attendance', 'gov'] as SystemConfigPlacement[]) {
        const wrapper = mountPanel(placement)
        await flushPromises()
        await nextTick()
        expect(wrapper.text(), placement).not.toContain('需金流簽核權限')
      }
    })
  })
})
