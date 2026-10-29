import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import ReturningClassBonusView from '../ReturningClassBonusView.vue'

// 舊生註冊／預繳獎金頁：
// - 設定載入失敗時表單停在「全關、金額 0」的預設值，不能讓人按儲存把原設定蓋掉
// - 逐班推導／已發放明細載入失敗不可退回空資料
// - 設定有未儲存變更要提示並攔離開

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  putConfig: vi.fn(),
  getPreview: vi.fn(),
  settle: vi.fn(),
  listExtraBonuses: vi.fn(),
  hasPermission: vi.fn(),
  hasFullSalaryView: vi.fn(),
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('@/api/returningClassBonus', () => ({
  getReturningBonusConfig: (...a: unknown[]) => mocks.getConfig(...a),
  putReturningBonusConfig: (...a: unknown[]) => mocks.putConfig(...a),
  getReturningBonusPreview: (...a: unknown[]) => mocks.getPreview(...a),
  settleReturningBonus: (...a: unknown[]) => mocks.settle(...a),
}))
vi.mock('@/api/extraBonuses', () => ({
  listExtraBonuses: (...a: unknown[]) => mocks.listExtraBonuses(...a),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => mocks.hasPermission(...a),
  hasFullSalaryView: () => mocks.hasFullSalaryView(),
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (...a: unknown[]) => mocks.onBeforeRouteLeave(...a),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

const STUBS = {
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<span><slot /></span>' },
  'el-select': true,
  'el-option': true,
  'el-switch': true,
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': true,
  'el-input-number': true,
  'el-checkbox': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-table': { props: ['data'], template: '<div class="table-stub">{{ JSON.stringify(data) }}</div>' },
  'el-table-column': true,
  'el-alert': {
    props: ['title', 'description'],
    template: '<div class="alert-stub">{{ title }}{{ description }}</div>',
  },
  'el-result': { props: ['title', 'subTitle'], template: '<div>{{ title }}</div>' },
  // emits 要明寫：否則父層的 @click 會同時當原生監聽器落在 <button> 上，點一次觸發兩次。
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}

const savedConfig = () => ({
  registration: { enabled: true, check_dates: ['03-15', '09-15'], head_amount: 2000, assistant_amount: 1000 },
  prepay: { enabled: false, check_dates: ['06-15', '12-15'], head_amount: 0, assistant_amount: 0 },
})

const previewFixture = (over: Record<string, unknown> = {}) => ({
  kind: 'registration',
  category: 'returning_registration',
  category_label: '舊生註冊率獎金',
  check_date: '2026-03-15',
  cohort_date: '2026-02-01',
  enabled: true,
  head_amount: 2000,
  assistant_amount: 1000,
  payout_total: 2000,
  warnings: [],
  classes: [
    {
      classroom_id: 1,
      classroom_name: '向日葵班',
      cohort_count: 20,
      qualified_count: 20,
      rate: 1,
      qualifies: true,
      payouts: [{ employee_id: 2, employee_name: '林慧慈', role: 'head', amount: 2000, note: null }],
    },
  ],
  payouts: [
    {
      employee_id: 2,
      employee_name: '林慧慈',
      roles: ['head'],
      classrooms: ['向日葵班'],
      amount: 2000,
      already_paid: false,
      legacy_other_amount: 0,
    },
  ],
  ...over,
})

const extraBonus = {
  id: 1,
  employee_id: 2,
  employee_name: '林慧慈',
  category: 'returning_registration',
  category_label: '舊生註冊率獎金',
  amount: 2000,
  counts_for_supplementary: true,
  created_at: null,
  paid_date: null,
  period_month: 3,
  period_year: 2026,
  remark: '',
}

const failure = () => Object.assign(new Error('boom'), { response: { status: 500, data: {} } })

interface ViewVm {
  configError: boolean
  configDirty: boolean
  configSaving: boolean
  configForm: { registration: { head_amount: number; enabled: boolean }; prepay: { head_amount: number } }
  checkDateTexts: { registration: string; prepay: string }
  previewError: boolean
  extraBonusError: boolean
  settleDisabled: boolean
  saveConfig: () => Promise<void>
  doSettle: () => Promise<void>
  fetchConfig: () => Promise<void>
}

const mountView = () =>
  mount(ReturningClassBonusView, { global: { stubs: STUBS, directives: { loading: () => {} } } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-20T09:00:00+08:00'))
  mocks.hasPermission.mockReset().mockReturnValue(true)
  mocks.hasFullSalaryView.mockReset().mockReturnValue(true)
  mocks.getConfig.mockReset().mockResolvedValue({ data: savedConfig() })
  mocks.putConfig.mockReset()
  mocks.getPreview.mockReset().mockResolvedValue({ data: previewFixture() })
  mocks.settle.mockReset()
  mocks.listExtraBonuses.mockReset().mockResolvedValue({ data: { items: [], total_amount: 0 } })
  mocks.onBeforeRouteLeave.mockReset()
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.error).mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessageBox.confirm).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ReturningClassBonusView 基本載入', () => {
  it('非完整薪資角色不載入任何資料', async () => {
    mocks.hasFullSalaryView.mockReturnValue(false)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('無法檢視全員薪資資料')
    expect(mocks.getConfig).not.toHaveBeenCalled()
    expect(mocks.getPreview).not.toHaveBeenCalled()
  })

  it('載入成功：顯示逐班推導與領取人；欄名用白話「舊生人數」', async () => {
    const wrapper = mount(ReturningClassBonusView, {
      global: {
        stubs: {
          ...STUBS,
          // 讓欄名可見：table 只渲染欄位 stub，欄位 stub 只印 label
          'el-table': { template: '<div class="cols"><slot /></div>' },
          'el-table-column': { props: ['label'], template: '<span class="col">{{ label }}</span>' },
        },
        directives: { loading: () => {} },
      },
    })
    await flushPromises()

    expect(mocks.getPreview).toHaveBeenCalledWith({ kind: 'registration', year: 2026, month: 3 })
    const labels = wrapper.findAll('.col').map((c) => c.text())
    expect(labels).toContain('舊生人數')
    expect(labels).not.toContain('舊生母體')
    expect(wrapper.text()).not.toContain('母體')
    expect((wrapper.vm as unknown as ViewVm).configError).toBe(false)
  })
})

describe('ReturningClassBonusView 設定載入失敗不可讓人蓋掉原設定', () => {
  it('設定載入失敗：顯示錯誤態，儲存鈕停用，直接呼叫也不送 PUT', async () => {
    mocks.getConfig.mockRejectedValueOnce(failure())
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm

    expect(vm.configError).toBe(true)
    expect(wrapper.text()).toContain('獎金設定載入失敗')
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('儲存設定'))
    expect(saveBtn?.attributes('disabled')).toBeDefined()
    // 預覽區也不能說「尚未設定核算日」（那會被誤讀成真的沒設定）
    expect(wrapper.findAll('.empty-state__title').map((t) => t.text())).toEqual(['獎金設定載入失敗', '無法推導'])

    await vm.saveConfig()
    expect(mocks.putConfig).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('重新載入成功後恢復設定，儲存鈕仍因「無變更」停用', async () => {
    mocks.getConfig.mockRejectedValueOnce(failure())
    const wrapper = mountView()
    await flushPromises()
    mocks.getConfig.mockResolvedValueOnce({ data: savedConfig() })

    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flushPromises()

    const vm = wrapper.vm as unknown as ViewVm
    expect(vm.configError).toBe(false)
    expect(vm.configForm.registration.head_amount).toBe(2000)
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('儲存設定'))
    expect(saveBtn?.attributes('disabled')).toBeDefined()
  })
})

describe('ReturningClassBonusView 設定未儲存變更', () => {
  it('改了金額才算有變更：顯示提示並啟用儲存；改回原值又恢復', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm
    expect(vm.configDirty).toBe(false)
    expect(wrapper.find('[data-test="config-dirty-hint"]').exists()).toBe(false)

    vm.configForm.registration.head_amount = 2500
    await flushPromises()
    expect(vm.configDirty).toBe(true)
    expect(wrapper.find('[data-test="config-dirty-hint"]').exists()).toBe(true)
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('儲存設定'))
    expect(saveBtn?.attributes('disabled')).toBeUndefined()

    vm.configForm.registration.head_amount = 2000
    await flushPromises()
    expect(vm.configDirty).toBe(false)
  })

  it('核算日寫法不同但正規化後相同（3-15 與 03-15）不算變更', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm
    vm.checkDateTexts.registration = '3-15, 9/15'
    await flushPromises()
    expect(vm.configDirty).toBe(false)
  })

  it('有未儲存變更時離開頁面會被攔下；沒有變更直接放行', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm
    const guard = mocks.onBeforeRouteLeave.mock.calls[0][0] as () => Promise<boolean>

    expect(await guard()).toBe(true)

    vm.configForm.registration.head_amount = 2500
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    expect(await guard()).toBe(false)
  })

  it('儲存成功後重新取得推導並清掉未儲存提示；儲存失敗則保留輸入並顯示錯誤', async () => {
    mocks.putConfig.mockRejectedValueOnce(failure())
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm
    vm.configForm.registration.head_amount = 2500

    await vm.saveConfig()
    await flushPromises()
    expect(String(vi.mocked(ElMessage.error).mock.calls.at(-1)?.[0])).toContain('儲存獎金設定失敗')
    expect(vm.configDirty).toBe(true)
    expect(vm.configSaving).toBe(false)

    const saved = savedConfig()
    saved.registration.head_amount = 2500
    mocks.putConfig.mockResolvedValueOnce({ data: saved })
    mocks.getPreview.mockClear()
    await vm.saveConfig()
    await flushPromises()
    expect(mocks.putConfig).toHaveBeenCalledTimes(2)
    expect(mocks.getPreview).toHaveBeenCalledTimes(1)
    expect(vm.configDirty).toBe(false)
  })

  it('金額超出範圍時前端先擋，不送 PUT', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm
    vm.configForm.registration.head_amount = 999999

    await vm.saveConfig()
    expect(mocks.putConfig).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('ReturningClassBonusView 推導與明細載入失敗', () => {
  it('逐班推導載入失敗：顯示錯誤態，不留舊資料，擋下結算；重試成功後恢復', async () => {
    mocks.getPreview.mockRejectedValueOnce(failure())
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm

    expect(vm.previewError).toBe(true)
    expect(wrapper.text()).toContain('逐班推導載入失敗')
    expect(wrapper.text()).not.toContain('向日葵班')
    expect(vm.settleDisabled).toBe(true)

    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flushPromises()
    expect(vm.previewError).toBe(false)
    expect(wrapper.text()).toContain('向日葵班')
    expect(vm.settleDisabled).toBe(false)
  })

  it('已發放明細載入失敗：顯示錯誤態，不說「查無已發放明細」', async () => {
    mocks.listExtraBonuses.mockRejectedValueOnce(failure())
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm

    expect(vm.extraBonusError).toBe(true)
    expect(wrapper.text()).toContain('已發放明細載入失敗')
    expect(wrapper.findAll('.empty-state__title').map((t) => t.text())).not.toContain('查無已發放明細')

    mocks.listExtraBonuses.mockResolvedValueOnce({ data: { items: [extraBonus], total_amount: 2000 } })
    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flushPromises()
    expect(vm.extraBonusError).toBe(false)
    expect(wrapper.text()).toContain('林慧慈')
  })
})

describe('ReturningClassBonusView 結算', () => {
  it('結算前確認（文案用白話「獨立轉帳」）；取消不送，確認後送出勾選名單', async () => {
    mocks.settle.mockResolvedValue({
      data: {
        kind: 'registration',
        category: 'returning_registration',
        check_date: '2026-03-15',
        period_year: 2026,
        period_month: 3,
        created: [{ employee_id: 2, employee_name: '林慧慈', amount: 2000 }],
        skipped_already_paid: [],
        skipped_finalized: [],
        skipped_legacy_other: [],
        skipped_self: [],
        skipped_unselected: [],
        total_amount: 2000,
        warnings: [],
      },
    })
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as ViewVm

    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await vm.doSettle()
    expect(mocks.settle).not.toHaveBeenCalled()

    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await vm.doSettle()
    await flushPromises()
    expect(mocks.settle).toHaveBeenCalledWith({ kind: 'registration', year: 2026, month: 3, employee_ids: [2] })
    const [message] = vi.mocked(ElMessageBox.confirm).mock.calls.at(-1) ?? []
    expect(String(message)).toContain('獨立轉帳')
    expect(String(message)).not.toContain('表外獎金')
  })

  it('結算失敗顯示錯誤提示', async () => {
    mocks.settle.mockRejectedValueOnce(failure())
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as unknown as ViewVm).doSettle()
    await flushPromises()
    expect(String(vi.mocked(ElMessage.error).mock.calls.at(-1)?.[0])).toContain('結算失敗')
  })

  it('無 SALARY_WRITE 時看不到儲存設定與結算鈕', async () => {
    mocks.hasPermission.mockImplementation((name: string) => name === 'SALARY_READ')
    const wrapper = mountView()
    await flushPromises()

    const texts = wrapper.findAll('button').map((b) => b.text())
    expect(texts.some((t) => t.includes('儲存設定'))).toBe(false)
    expect(texts.some((t) => t.includes('結算'))).toBe(false)
  })
})
