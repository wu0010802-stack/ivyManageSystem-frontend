/**
 * 總部「政府資料同步」頁（spec 2026-08-18 §5）。
 *
 * 這頁維護的是 GLOBAL 表（`insurance_brackets` / `insurance_rates`），一改對
 * **全平台所有租戶**生效並讓該年度未封存薪資全部需重算——所以「貼上 → 預覽
 * diff → 填原因 → 二次確認」這條路徑不可被繞過，且來源為程式內建 fallback
 * 時必須是紅字告警而非中性標示。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getGovData: vi.fn(),
  previewGovBrackets: vi.fn(),
  updateInsuranceBrackets: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/api/platform', () => ({
  getGovData: h.getGovData,
  previewGovBrackets: h.previewGovBrackets,
  updateInsuranceBrackets: h.updateInsuranceBrackets,
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: h.success, error: h.error, warning: h.warning },
  ElMessageBox: { confirm: h.confirm },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import PlatformGovDataView from '../PlatformGovDataView.vue'

const BRACKET_ROW = {
  amount: 30300,
  labor_employee: 758,
  labor_employer: 2651,
  health_employee: 470,
  health_employer: 1466,
  pension: 1818,
}

function govData(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      runtime: { brackets_year: 2026, brackets_source: 'db', bracket_count: 82 },
      brackets: { requested_year: 2026, effective_year: 2026, rows: [BRACKET_ROW] },
      rates: { id: 1, rate_year: 2026, labor_rate: 0.125, health_rate: 0.0517 },
      builtin_consistency: { rows: [], summary: { added: 0, changed: 0, removed: 0, unchanged: 82 } },
      ...overrides,
    },
  }
}

const stubs = {
  PageHeader: { props: ['title'], template: '<div>{{ title }}<slot name="actions" /></div>' },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="el-alert" :data-type="type">{{ title }}<slot /></div>',
  },
  // ⚠ 不可再寫 @click="$emit('click')"：元件上的 @click 已 fallthrough 到 root
  // button，再 emit 一次會讓每次點擊觸發兩次 handler（既有 PlatformRoleSyncView.spec
  // 的 stub 也是這個寫法）。
  'el-button': {
    props: ['disabled', 'loading', 'type'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
  'el-tag': {
    props: ['type'],
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
  },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': {
    props: ['label'],
    template: '<div><span>{{ label }}</span><slot /></div>',
  },
  'el-select': { props: ['modelValue'], template: '<select><slot /></select>' },
  'el-option': { template: '<option />' },
  'el-input': {
    props: ['modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-input-number': { props: ['modelValue'], template: '<input />' },
  'el-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
  },
  'el-table': {
    props: ['data'],
    template: '<div class="el-table"><slot /></div>',
  },
  'el-table-column': { template: '<div />' },
  'el-empty': { template: '<div />' },
  'el-icon': true,
}

async function mountView() {
  const wrapper = mount(PlatformGovDataView, {
    global: { directives: { loading: {} }, stubs },
  })
  await flushPromises()
  return wrapper
}

describe('PlatformGovDataView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getGovData.mockResolvedValue(govData())
    h.confirm.mockResolvedValue('confirm')
    h.previewGovBrackets.mockResolvedValue({
      data: {
        effective_year: 2027,
        parsed_count: 1,
        compared_year: null,
        diff: {
          rows: [{ amount: 30300, status: 'added', changed_fields: {}, current: null, incoming: BRACKET_ROW }],
          summary: { added: 1, changed: 0, removed: 0, unchanged: 0 },
        },
      },
    })
    h.updateInsuranceBrackets.mockResolvedValue({ data: { upserted: 1, stale_marked: 3 } })
  })

  it('顯示實算生效的級距版本與來源', async () => {
    const wrapper = await mountView()

    const text = wrapper.text()
    expect(text).toContain('2026')
    expect(text).toContain('82')
    expect(wrapper.find('[data-testid="bracket-source"]').text()).toContain('DB')
  })

  it('來源為程式內建時紅字告警', async () => {
    h.getGovData.mockResolvedValue(
      govData({ runtime: { brackets_year: 2026, brackets_source: 'builtin', bracket_count: 82 } }),
    )
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="bracket-source"]').attributes('data-type')).toBe('danger')
    expect(wrapper.text()).toContain('程式內建')
  })

  it('匯入前先 preview，未確認不得寫入', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('30300,758,2651,470,1466,1818')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()

    expect(h.previewGovBrackets).toHaveBeenCalled()
    // 只按預覽不可寫入
    expect(h.updateInsuranceBrackets).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('新增 1')
  })

  it('原因少於 10 字時不送出（後端硬性要求，前端先擋以免白跑一趟）', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('30300,758,2651,470,1466,1818')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="import-reason"]').setValue('太短')
    await wrapper.find('[data-testid="import-submit"]').trigger('click')
    await flushPromises()

    expect(h.updateInsuranceBrackets).not.toHaveBeenCalled()
  })

  it('填妥原因並二次確認後才寫入，並帶上 reason 與年度', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('30300,758,2651,470,1466,1818')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="import-reason"]').setValue('115 年度政府公告級距表更新')
    await wrapper.find('[data-testid="import-submit"]').trigger('click')
    await flushPromises()

    expect(h.confirm).toHaveBeenCalled()
    expect(h.updateInsuranceBrackets).toHaveBeenCalledTimes(1)
    const body = h.updateInsuranceBrackets.mock.calls[0][0]
    expect(body.reason).toBe('115 年度政府公告級距表更新')
    expect(body.brackets).toHaveLength(1)
    expect(body.effective_year).toBe(2027)
    // 預設不帶封存月豁免——那是遇到 409 後由人二次確認才給的
    expect(body.acknowledge_finalized_months).toBe(false)
  })

  it('該年度已有封存月時，409 要走二次確認才帶 acknowledge 重送', async () => {
    h.updateInsuranceBrackets
      .mockRejectedValueOnce({
        response: { status: 409, data: { detail: '該年度全平台已有 3 個月份封存' } },
      })
      .mockResolvedValueOnce({ data: { upserted: 1, stale_marked: 0 } })

    const wrapper = await mountView()
    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('30300,758,2651,470,1466,1818')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="import-reason"]').setValue('115 年度政府公告級距表更新')
    await wrapper.find('[data-testid="import-submit"]').trigger('click')
    await flushPromises()

    expect(h.updateInsuranceBrackets).toHaveBeenCalledTimes(2)
    expect(h.updateInsuranceBrackets.mock.calls[0][0].acknowledge_finalized_months).toBe(false)
    expect(h.updateInsuranceBrackets.mock.calls[1][0].acknowledge_finalized_months).toBe(true)
    // 後端訊息（含封存月數）必須讓操作者看到，不可自動繞過
    expect(h.confirm.mock.calls.at(-1)?.[0]).toContain('3 個月份封存')
  })

  it('封存月二次確認被取消時不得重送', async () => {
    h.updateInsuranceBrackets.mockRejectedValueOnce({
      response: { status: 409, data: { detail: '該年度全平台已有 3 個月份封存' } },
    })
    // 第一次 confirm（一般確認）通過，第二次（封存月）取消
    h.confirm.mockResolvedValueOnce('confirm').mockRejectedValueOnce('cancel')

    const wrapper = await mountView()
    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('30300,758,2651,470,1466,1818')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="import-reason"]').setValue('115 年度政府公告級距表更新')
    await wrapper.find('[data-testid="import-submit"]').trigger('click')
    await flushPromises()

    expect(h.updateInsuranceBrackets).toHaveBeenCalledTimes(1)
  })

  it('二次確認被取消時不得寫入', async () => {
    h.confirm.mockRejectedValue('cancel')
    const wrapper = await mountView()

    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('30300,758,2651,470,1466,1818')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="import-reason"]').setValue('115 年度政府公告級距表更新')
    await wrapper.find('[data-testid="import-submit"]').trigger('click')
    await flushPromises()

    expect(h.updateInsuranceBrackets).not.toHaveBeenCalled()
  })

  it('CSV 有誤時顯示後端帶行號的訊息，且不進入可送出狀態', async () => {
    h.previewGovBrackets.mockRejectedValue({
      response: { data: { detail: '第 3 行有 5 欄，應為 6 欄' } },
    })
    const wrapper = await mountView()

    await wrapper.find('[data-testid="import-open"]').trigger('click')
    await wrapper.find('[data-testid="import-content"]').setValue('bad')
    await wrapper.find('[data-testid="import-preview"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="import-error"]').text()).toContain('第 3 行')
    expect(wrapper.find('[data-testid="import-submit"]').attributes('disabled')).toBeDefined()
  })
})
