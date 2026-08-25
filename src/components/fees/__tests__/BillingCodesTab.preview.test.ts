/**
 * 銷帳碼（BillingCodesTab）IA 改版行為：
 * 建議預覽的摘要計數、需處理優先篩選（無變更預設隱藏）、
 * 無法產碼名單、批次啟用前確認。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getBillingCodes: vi.fn(),
  suggestBillingCodes: vi.fn(),
  activateBillingCodes: vi.fn(),
  deactivateBillingCode: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

const epMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: epMocks.confirm, prompt: vi.fn() },
}))

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'div',
        { ...attrs },
        props.data.length === 0
          ? [slots.empty?.()]
          : (props.data as Record<string, unknown>[]).map((row, i) =>
              h('div', { key: i, 'data-testid': 'suggest-row' }, JSON.stringify(row)),
            ),
      )
  },
})

const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': { template: '<span />' },
  'el-select': { template: '<select v-bind="$attrs"><slot /></select>' },
  'el-option': { template: '<option v-bind="$attrs" />' },
  'el-radio-group': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-radio-button': { template: '<button type="button"><slot /></button>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-alert': { template: '<div v-bind="$attrs" />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
}

const flushAll = async () => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import BillingCodesTab from '@/components/fees/BillingCodesTab.vue'

const SUGGEST_RESULT = {
  school_year: 115,
  semester: 1,
  suggestions: [
    { student_id: 1, student_name: '甲', classroom_id: 10, classroom_name: 'A', grade_name: '大班', suggested_suffix: '1101', current_suffix: null, state: 'new' },
    { student_id: 2, student_name: '乙', classroom_id: 10, classroom_name: 'A', grade_name: '大班', suggested_suffix: '1102', current_suffix: '1102', state: 'unchanged' },
    { student_id: 3, student_name: '丙', classroom_id: 10, classroom_name: 'A', grade_name: '大班', suggested_suffix: '1103', current_suffix: '2103', state: 'conflict' },
    { student_id: 4, student_name: '丁', classroom_id: 10, classroom_name: 'A', grade_name: '大班', suggested_suffix: '1103', current_suffix: null, state: 'duplicate' },
  ],
  unassignable: [{ student_id: 99, reason: '班內學生數超過 99，無法配座號' }],
}

function mountTab() {
  return mount(BillingCodesTab, {
    global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
  })
}

async function mountWithSuggest() {
  const wrapper = mountTab()
  await flushAll()
  await wrapper.find('[data-test="bc-suggest"]').trigger('click')
  await flushAll()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  apiMocks.getBillingCodes.mockResolvedValue([])
  apiMocks.suggestBillingCodes.mockResolvedValue(SUGGEST_RESULT)
  apiMocks.activateBillingCodes.mockResolvedValue({ activated: 1, closed: 0 })
  epMocks.confirm.mockResolvedValue(undefined)
})

describe('BillingCodesTab 建議預覽', () => {
  it('顯示摘要計數（新配發/衝突/重複/無變更/無法產碼）', async () => {
    const wrapper = await mountWithSuggest()
    const summary = wrapper.find('[data-test="bc-suggest-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('新配發 1')
    expect(summary.text()).toContain('與現行衝突 1')
    expect(summary.text()).toContain('重複 1')
    expect(summary.text()).toContain('無變更 1')
    expect(summary.text()).toContain('無法產碼 1')
  })

  it('預設「需處理」：隱藏無變更列，只列新配發/衝突/重複', async () => {
    const wrapper = await mountWithSuggest()
    const rows = wrapper
      .find('[data-test="bc-suggest-table"]')
      .findAll('[data-testid="suggest-row"]')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.text()).join()).not.toContain('unchanged')
  })

  it('切「無變更」「全部」篩選可查看其餘資料', async () => {
    const wrapper = await mountWithSuggest()
    await wrapper.find('[data-test="bc-preview-scope-unchanged"]').trigger('click')
    await flushAll()
    expect(
      wrapper.find('[data-test="bc-suggest-table"]').findAll('[data-testid="suggest-row"]'),
    ).toHaveLength(1)
    await wrapper.find('[data-test="bc-preview-scope-all"]').trigger('click')
    await flushAll()
    expect(
      wrapper.find('[data-test="bc-suggest-table"]').findAll('[data-testid="suggest-row"]'),
    ).toHaveLength(4)
  })

  it('無法產碼名單列出原因（不含姓名 PII，僅識別編號）', async () => {
    const wrapper = await mountWithSuggest()
    const box = wrapper.find('[data-test="bc-unassignable"]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('學生 #99')
    expect(box.text()).toContain('無法配座號')
  })

  it('批次啟用先經確認對話框，取消則不送出', async () => {
    const wrapper = await mountWithSuggest()
    const vm = wrapper.vm as unknown as { effectiveFrom: string }
    vm.effectiveFrom = '2026-09-01'
    await flushAll()

    epMocks.confirm.mockRejectedValueOnce(new Error('cancel'))
    await wrapper.find('[data-test="bc-activate"]').trigger('click')
    await flushAll()
    expect(apiMocks.activateBillingCodes).not.toHaveBeenCalled()

    epMocks.confirm.mockResolvedValueOnce(undefined)
    await wrapper.find('[data-test="bc-activate"]').trigger('click')
    await flushAll()
    expect(apiMocks.activateBillingCodes).toHaveBeenCalledTimes(1)
    // 只送出「新配發」項目，不覆蓋衝突/重複
    const payload = apiMocks.activateBillingCodes.mock.calls[0][0] as {
      items: { student_id: number }[]
    }
    expect(payload.items).toEqual([{ student_id: 1, code_suffix: '1101' }])
  })

  it('無 FEES_WRITE 時不顯示產生建議與啟用按鈕', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.find('[data-test="bc-suggest"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="bc-activate"]').exists()).toBe(false)
  })
})
