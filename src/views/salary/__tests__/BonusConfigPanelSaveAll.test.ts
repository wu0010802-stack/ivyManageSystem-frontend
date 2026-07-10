import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import BonusConfigPanel from '@/views/salary/BonusConfigPanel.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ── API mocks ────────────────────────────────────────────────────────────────
const getBonusConfig = vi.fn()
const updateBonusConfig = vi.fn()
const getGradeTargets = vi.fn()
const updateGradeTargets = vi.fn()
const getPositionSalary = vi.fn()
const updatePositionSalary = vi.fn()
const comparePositionSalary = vi.fn()
const syncPositionSalary = vi.fn()
const getTitles = vi.fn()
const updateTitle = vi.fn()

vi.mock('@/api/config', () => ({
  getBonusConfig: (...a: unknown[]) => getBonusConfig(...a),
  updateBonusConfig: (...a: unknown[]) => updateBonusConfig(...a),
  getGradeTargets: (...a: unknown[]) => getGradeTargets(...a),
  updateGradeTargets: (...a: unknown[]) => updateGradeTargets(...a),
  getPositionSalary: (...a: unknown[]) => getPositionSalary(...a),
  updatePositionSalary: (...a: unknown[]) => updatePositionSalary(...a),
  comparePositionSalary: (...a: unknown[]) => comparePositionSalary(...a),
  syncPositionSalary: (...a: unknown[]) => syncPositionSalary(...a),
  getTitles: (...a: unknown[]) => getTitles(...a),
  updateTitle: (...a: unknown[]) => updateTitle(...a),
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
  ElMessageBox: {
    prompt: vi.fn(),
  },
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const GLOBAL_STUBS = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot name="label" /><slot /></label>' },
  'el-input-number': { props: ['modelValue'], template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-table': { template: '<div><slot /></div>' },
  // 表格欄位含 scope.row 具名 slot；stub 為 true 不渲染 slot，避免 scope undefined
  'el-table-column': true,
  'el-divider': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-empty': true,
  'el-alert': { template: '<div><slot /></div>' },
  'el-button': {
    props: ['disabled'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-icon': { template: '<span><slot /></span>' },
}

function mountPanel() {
  return shallowMount(BonusConfigPanel, {
    global: {
      directives: { loading: {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

interface SetupState {
  saveAllBonusSettings: () => Promise<void>
  gradeTargets: { value: Record<string, unknown>[] }
}

describe('BonusConfigPanel — saveAllBonusSettings 儲存閘門', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockReturnValue(true)
    getBonusConfig.mockResolvedValue({ data: {} })
    getGradeTargets.mockResolvedValue({ data: { 大班: {} } })
    getPositionSalary.mockResolvedValue({ data: {} })
    comparePositionSalary.mockResolvedValue({ data: { employees: [], out_of_sync: 0 } })
    getTitles.mockResolvedValue({ data: [] })
    updateBonusConfig.mockResolvedValue({ data: {} })
    updateGradeTargets.mockResolvedValue({ data: {} })
  })

  it('使用者取消「異動原因」時，不得寫入年級目標、且不得謊報全部成功', async () => {
    // 取消 prompt → ElMessageBox.prompt reject
    ;(ElMessageBox.prompt as unknown as ReturnType<typeof vi.fn>).mockRejectedValue('cancel')

    const wrapper = mountPanel()
    await flushPromises()
    const state = wrapper.vm.$.setupState as unknown as SetupState

    await state.saveAllBonusSettings()
    await flushPromises()

    // 費率未儲存
    expect(updateBonusConfig).not.toHaveBeenCalled()
    // 年級目標「不得」照樣寫入
    expect(updateGradeTargets).not.toHaveBeenCalled()
    // 不得顯示總成功訊息
    expect(ElMessage.success).not.toHaveBeenCalledWith('所有薪資設定已儲存')
  })

  it('獎金費率儲存失敗時，不得寫入年級目標、且不得謊報全部成功', async () => {
    ;(ElMessageBox.prompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: '這是一段足夠長度的異動原因說明',
    })
    updateBonusConfig.mockRejectedValue({ response: { data: { detail: '權限不足' } } })

    const wrapper = mountPanel()
    await flushPromises()
    const state = wrapper.vm.$.setupState as unknown as SetupState

    await state.saveAllBonusSettings()
    await flushPromises()

    expect(updateBonusConfig).toHaveBeenCalled()
    // 費率失敗後「不得」續寫年級目標
    expect(updateGradeTargets).not.toHaveBeenCalled()
    // 不得顯示總成功訊息（否則與錯誤訊息矛盾）
    expect(ElMessage.success).not.toHaveBeenCalledWith('所有薪資設定已儲存')
  })

  it('原因通過且全部成功時，費率與年級目標皆寫入並顯示總成功訊息', async () => {
    ;(ElMessageBox.prompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: '這是一段足夠長度的異動原因說明',
    })

    const wrapper = mountPanel()
    await flushPromises()
    const state = wrapper.vm.$.setupState as unknown as SetupState

    await state.saveAllBonusSettings()
    await flushPromises()

    expect(updateBonusConfig).toHaveBeenCalledWith(
      expect.objectContaining({ reason: '這是一段足夠長度的異動原因說明' }),
    )
    expect(updateGradeTargets).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('所有薪資設定已儲存')
  })
})

// 薪資模組稽核 P2：saveAllBonusSettings 最終送到 PUT /config/bonus，後端除
// SETTINGS_WRITE 外還額外要求 ACTIVITY_PAYMENT_APPROVE（見 ivy-backend
// api/config/bonus.py update_bonus_config）。前端 gate 需對齊，唯讀使用者
// 不應能填完整張表、過完異動原因提示才吃 403。
// panel 內有多個 <button>（儲存所有薪資設定 / 儲存職位底薪設定 等），
// 以文字比對取目標按鈕，避免依賴 DOM 順序造成脆弱測試。
function findSaveAllButton(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('button').find((b) => b.text().includes('儲存所有薪資設定'))!
}

describe('BonusConfigPanel — 儲存按鈕權限 gate（對齊 PUT /config/bonus）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBonusConfig.mockResolvedValue({ data: {} })
    getGradeTargets.mockResolvedValue({ data: { 大班: {} } })
    getPositionSalary.mockResolvedValue({ data: {} })
    comparePositionSalary.mockResolvedValue({ data: { employees: [], out_of_sync: 0 } })
    getTitles.mockResolvedValue({ data: [] })
    updateBonusConfig.mockResolvedValue({ data: {} })
    updateGradeTargets.mockResolvedValue({ data: {} })
  })

  it('只有 SETTINGS_READ（無 WRITE/APPROVE）：儲存按鈕 disabled，直接呼叫 saveAllBonusSettings 也不送出', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')

    const wrapper = mountPanel()
    await flushPromises()

    const button = findSaveAllButton(wrapper)
    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeDefined()

    const state = wrapper.vm.$.setupState as unknown as SetupState
    await state.saveAllBonusSettings()
    await flushPromises()

    expect(updateBonusConfig).not.toHaveBeenCalled()
    expect(updateGradeTargets).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('只有 SETTINGS_WRITE（缺 ACTIVITY_PAYMENT_APPROVE）：儲存按鈕仍 disabled', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ' || p === 'SETTINGS_WRITE')

    const wrapper = mountPanel()
    await flushPromises()

    const button = findSaveAllButton(wrapper)
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('具 SETTINGS_WRITE + ACTIVITY_PAYMENT_APPROVE：儲存按鈕可用且可正常送出', async () => {
    hasPermissionMock.mockReturnValue(true)
    ;(ElMessageBox.prompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: '這是一段足夠長度的異動原因說明',
    })

    const wrapper = mountPanel()
    await flushPromises()

    const button = findSaveAllButton(wrapper)
    expect(button.attributes('disabled')).toBeUndefined()

    const state = wrapper.vm.$.setupState as unknown as SetupState
    await state.saveAllBonusSettings()
    await flushPromises()

    expect(updateBonusConfig).toHaveBeenCalled()
  })
})
