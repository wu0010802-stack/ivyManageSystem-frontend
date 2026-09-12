/**
 * SPEC-025 繳款單範本對話框：三步狀態機與下載。
 *
 * - 打開即試算，金額欄用後端回的 by_grade 畫（第一次沒有金額也要畫得出來）
 * - 缺金額／缺銷帳碼／重複碼／缺年段各自擋住下一步與下載
 * - 下載走 exportSlipTemplate + saveBlobResponse
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, inject, nextTick, provide } from 'vue'

const apiMocks = vi.hoisted(() => ({
  previewSlipTemplate: vi.fn(),
  exportSlipTemplate: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const downloadMocks = vi.hoisted(() => ({ saveBlobResponse: vi.fn() }))
vi.mock('@/utils/download', () => downloadMocks)

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

import FeeSlipTemplateDialog from '../FeeSlipTemplateDialog.vue'

function preview(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'monthly',
    bill_year: 2026,
    bill_month: 9,
    project_code: '998172',
    account_period: '2609',
    rows_total: 2,
    total_amount: 21600,
    active_total: 2,
    excluded_new_students: 0,
    excluded_manual: 0,
    by_grade: [{ grade_name: '大班', student_count: 2, amount: 10800, subtotal: 21600 }],
    missing_suffix: [],
    duplicate_suffix: [],
    missing_grade: [],
    missing_amounts: [],
    sample_rows: [
      {
        student_name: '甲生',
        classroom_label: '天堂鳥班',
        grade_label: '大班',
        collection_suffix: '1101',
        full_collection_number: '99817226091101',
        amount: 10800,
      },
    ],
    amount_defaults: { 大班: 10800 },
    blocked: false,
    ...overrides,
  }
}

// ⚠ repo 的 vitest setup 不註冊 Element Plus——比照
// src/components/fees/__tests__/BillSlipTab.test.ts 自備 pass-through stub。
// 具名 slot（footer）也要渲染，否則下一步／下載按鈕找不到。
//
// 表格欄位的 `#default="{ row }"` 要能展開，故沿用該檔的 provide/inject 手法：
// el-table 把 props 往下 provide，el-table-column 逐列取出來渲染自己的插槽。
const TABLE_ROWS = Symbol('table-rows')

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    provide(TABLE_ROWS, props)
    return () => h('div', { 'data-testid': 'table' }, [slots.default?.()])
  },
})

const ElTableColumnStub = defineComponent({
  setup(_props, { slots }) {
    const holder = inject<{ data: unknown[] }>(TABLE_ROWS, { data: [] })
    return () =>
      h(
        'span',
        (holder.data ?? []).map((row) => h('span', slots.default?.({ row }))),
      )
  },
})

const STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-dialog': {
    props: ['modelValue', 'title'],
    template:
      '<div v-if="modelValue" v-bind="$attrs"><p>{{ title }}</p><slot /><slot name="footer" /></div>',
  },
  'el-steps': { template: '<div><slot /></div>' },
  'el-step': { props: ['title'], template: '<span>{{ title }}</span>' },
  'el-form': { template: '<form v-bind="$attrs"><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div><label>{{ label }}</label><slot /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  // 受控輸入：把 model-value 真的畫到 DOM、input 時回拋 update:model-value，
  // 否則「輸入被正規化後畫面是否同步」這類斷言會假綠（stub 根本沒接線）。
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input v-bind="$attrs" :value="modelValue" '
      + '@input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-input-number': { template: '<input type="number" v-bind="$attrs" />' },
  'el-select': { template: '<select v-bind="$attrs"><slot /></select>' },
  'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  'el-alert': { props: ['title'], template: '<div v-bind="$attrs">{{ title }}</div>' },
  'el-icon': { template: '<i><slot /></i>' },
}

function mountDialog() {
  return mount(FeeSlipTemplateDialog, {
    props: { modelValue: true, kind: 'monthly', defaultYear: 2026, defaultMonth: 9 },
    global: { stubs: { ...STUBS, teleport: true } },
  })
}

async function settle(wrapper: ReturnType<typeof mountDialog>) {
  await nextTick()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('FeeSlipTemplateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.previewSlipTemplate.mockResolvedValue(preview())
    apiMocks.exportSlipTemplate.mockResolvedValue({ data: new Blob(), headers: {} })
  })

  it('打開就試算，並帶入預設帳期', async () => {
    const wrapper = await settle(mountDialog())
    expect(apiMocks.previewSlipTemplate).toHaveBeenCalled()
    const payload = apiMocks.previewSlipTemplate.mock.calls[0][0]
    expect(payload.kind).toBe('monthly')
    expect(payload.bill_year).toBe(2026)
    expect(payload.bill_month).toBe(9)
    wrapper.unmount()
  })

  it('顯示各年段人數與金額', async () => {
    const wrapper = await settle(mountDialog())
    expect(wrapper.find('[data-test="slip-grade-row"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('大班')
    wrapper.unmount()
  })

  it('缺金額時擋住下一步', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        by_grade: [{ grade_name: '幼幼班', student_count: 3, amount: null, subtotal: 0 }],
        missing_amounts: ['幼幼班'],
        blocked: true,
        rows_total: 0,
        total_amount: 0,
      }),
    )
    const wrapper = await settle(mountDialog())
    const next = wrapper.find('[data-test="slip-next"]')
    expect(next.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('缺銷帳碼時列出學生與建議號碼，並擋住產檔', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        missing_suffix: [
          {
            student_id: 7,
            student_name: '沒碼',
            classroom_name: '牡丹班',
            suggested_suffix: '4115',
          },
        ],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('沒碼')
    expect(wrapper.text()).toContain('4115')
    expect(wrapper.find('[data-test="slip-download"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="slip-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('重複碼會把雙方都列出來', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        duplicate_suffix: [
          {
            collection_suffix: '1101',
            students: ['甲生', '乙生'],
            out_of_scope: false,
            from_assignment: false,
          },
        ],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('甲生')
    expect(wrapper.text()).toContain('乙生')
    expect(wrapper.find('[data-test="slip-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('缺年段時列出學生，並擋住下一步', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        missing_grade: [{ student_id: 9, student_name: '沒年段', classroom_name: '未知班' }],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('沒年段')
    expect(wrapper.text()).toContain('未知班')
    expect(wrapper.find('[data-test="slip-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('走到第三步可下載，並把 blob 交給 saveBlobResponse', async () => {
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    await wrapper.find('[data-test="slip-download"]').trigger('click')
    await settle(wrapper)
    expect(apiMocks.exportSlipTemplate).toHaveBeenCalledTimes(1)
    expect(downloadMocks.saveBlobResponse).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('指派銷帳碼會帶進試算 payload', async () => {
    // ⚠ payload 的 suffix_assignments 現在是每次重算的新物件（不再是被就地
    // 改寫的同一個 ref），所以必須真的把 debounce timer 推進、等第二次試算
    // 發出，才驗得到指派有帶進去。
    vi.useFakeTimers()
    try {
      apiMocks.previewSlipTemplate
        .mockResolvedValueOnce(
          preview({
            missing_suffix: [
              {
                student_id: 7,
                student_name: '沒碼',
                classroom_name: '牡丹班',
                suggested_suffix: '4115',
              },
            ],
            blocked: true,
          }),
        )
        .mockResolvedValue(preview())
      const wrapper = await settle(mountDialog())
      await wrapper.find('[data-test="slip-next"]').trigger('click')
      await settle(wrapper)
      await wrapper.find('[data-test="slip-apply-suggested"]').trigger('click')
      await vi.advanceTimersByTimeAsync(300)
      await settle(wrapper)
      expect(apiMocks.previewSlipTemplate).toHaveBeenCalledTimes(2)
      const lastPreview = apiMocks.previewSlipTemplate.mock.calls.at(-1)?.[0]
      expect(lastPreview.suffix_assignments).toEqual({ '7': '4115' })
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  // ── final-fix 回歸守衛 ──────────────────────────────────────────────────

  it('打到一半的銷帳碼不會進 payload，也不會觸發試算', async () => {
    // 後端對非 4 碼的指派直接 422，整個試算會變成「試算範本失敗」。
    vi.useFakeTimers()
    try {
      apiMocks.previewSlipTemplate.mockResolvedValue(
        preview({
          missing_suffix: [
            {
              student_id: 7,
              student_name: '沒碼',
              classroom_name: '牡丹班',
              suggested_suffix: '4115',
            },
          ],
          blocked: true,
        }),
      )
      const wrapper = await settle(mountDialog())
      await wrapper.find('[data-test="slip-next"]').trigger('click')
      await settle(wrapper)
      // 開啟時 reset() 重指派 classroomIds 會排一次多餘的試算，先讓它跑完
      await vi.advanceTimersByTimeAsync(300)
      await settle(wrapper)
      const callsBefore = apiMocks.previewSlipTemplate.mock.calls.length

      const input = wrapper.find('[data-test="slip-missing-suffix"] input')
      await input.setValue('411a')
      await vi.advanceTimersByTimeAsync(300)
      await settle(wrapper)

      // 畫面顯示的是正規化後的值，不殘留被剔除的字元
      expect((input.element as HTMLInputElement).value).toBe('411')
      // 1-3 碼不進 payload、也不重打試算
      expect(apiMocks.previewSlipTemplate.mock.calls.length).toBe(callsBefore)

      // 湊滿 4 碼才送出
      await input.setValue('4115')
      await vi.advanceTimersByTimeAsync(300)
      await settle(wrapper)
      const lastPreview = apiMocks.previewSlipTemplate.mock.calls.at(-1)?.[0]
      expect(lastPreview.suffix_assignments).toEqual({ '7': '4115' })

      // 湊滿後又退回 3 碼：要立刻把指派撤掉並重打試算，否則殘留的 3 碼會讓
      // 下一次試算被後端以「指定的銷帳碼須為 4 位數字」擋成 422
      await input.setValue('411')
      await vi.advanceTimersByTimeAsync(300)
      await settle(wrapper)
      const afterBackspace = apiMocks.previewSlipTemplate.mock.calls.at(-1)?.[0]
      expect(afterBackspace.suffix_assignments).toEqual({})
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('重複碼提示會區分「本次指派」與「範圍外」', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        duplicate_suffix: [
          {
            collection_suffix: '1101',
            students: ['甲生', '乙生'],
            out_of_scope: true,
            from_assignment: true,
          },
          {
            collection_suffix: '1202',
            students: ['丙生', '丁生'],
            out_of_scope: true,
            from_assignment: false,
          },
        ],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    const hints = wrapper.findAll('[data-test="slip-duplicate-hint"]').map((n) => n.text())
    // 本次剛指定的碼還沒存進資料庫，叫使用者去學生資料頁會查無此碼
    expect(hints[0]).toContain('本次剛指定')
    expect(hints[1]).toContain('不在本次選取的班級範圍內')
    wrapper.unmount()
  })

  it('缺年段的學生可以就地排除，不用被一位學生擋住整月出檔', async () => {
    vi.useFakeTimers()
    try {
      apiMocks.previewSlipTemplate.mockResolvedValue(
        preview({
          missing_grade: [
            { student_id: 9, student_name: '未編班生', classroom_name: null },
          ],
          blocked: true,
        }),
      )
      const wrapper = await settle(mountDialog())
      await wrapper.find('[data-test="slip-next"]').trigger('click')
      await settle(wrapper)
      // 沒有班級就沒有年段可補，提示不能叫使用者去班級管理
      expect(wrapper.text()).toContain('尚未編班')

      await wrapper.find('[data-test="slip-exclude-missing-grade"]').trigger('click')
      await vi.advanceTimersByTimeAsync(300)
      await settle(wrapper)
      const lastPreview = apiMocks.previewSlipTemplate.mock.calls.at(-1)?.[0]
      expect(lastPreview.exclude_student_ids).toEqual([9])
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('缺年段但有班級時提示去班級管理補年段', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        missing_grade: [
          { student_id: 9, student_name: '沒年段', classroom_name: '未知班' },
        ],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('請到班級管理補')
    wrapper.unmount()
  })

  it('註冊費單提醒未填預繳折抵', async () => {
    const wrapper = mount(FeeSlipTemplateDialog, {
      props: { modelValue: true, kind: 'registration', defaultYear: 2026, defaultMonth: 9 },
      global: { stubs: { ...STUBS, teleport: true } },
    })
    await settle(wrapper as ReturnType<typeof mountDialog>)
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper as ReturnType<typeof mountDialog>)
    expect(wrapper.find('[data-test="slip-prepaid-warning"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('5,000')
    wrapper.unmount()
  })

  it('月費單不出現預繳折抵提醒', async () => {
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('[data-test="slip-prepaid-warning"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
