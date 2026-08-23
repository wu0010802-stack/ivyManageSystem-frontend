// src/components/attendance/__tests__/AnomalyQueueColumn.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

// ── hoisted mocks（多選批次處理：直接呼叫 API，需 mock）─────────────────────────
const { mockBatchConfirm, mockNotify, mockConfirm } = vi.hoisted(() => ({
  mockBatchConfirm: vi.fn().mockResolvedValue({ data: { processed: 0 } }),
  mockNotify: vi.fn(),
  mockConfirm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/api/attendance', () => ({
  batchConfirmAnomalies: mockBatchConfirm,
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: mockNotify }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: (...args: unknown[]) => mockConfirm(...args) },
}))

import { ElMessage } from 'element-plus'
import AnomalyQueueColumn from '../AnomalyQueueColumn.vue'

// ── fixture data（P1-4：一天一張卡）────────────────────────────────────────────
const cardLate: AnomalyDayCard = {
  id: 10,
  employee_name: '王遲到',
  employee_number: 'E002',
  date: '2026-06-01',
  weekday: '一',
  confirmed_action: null,
  items: [
    { type: 'late', type_label: '遲到', detail: '遲到 15 分', estimated_deduction: 300 },
  ],
}

const cardMulti: AnomalyDayCard = {
  id: 20,
  employee_name: '李缺卡',
  employee_number: 'E003',
  date: '2026-06-02',
  weekday: '二',
  confirmed_action: null,
  items: [
    { type: 'missing_punch', type_label: '未打卡', detail: '缺打卡', estimated_deduction: 0 },
    { type: 'late', type_label: '遲到', detail: '遲到 5 分', estimated_deduction: 100 },
  ],
}

const cardConfirmed: AnomalyDayCard = {
  id: 30,
  employee_name: '陳早退',
  employee_number: 'E001',
  date: '2026-06-03',
  weekday: '三',
  confirmed_action: 'admin_accept',
  items: [
    { type: 'early_leave', type_label: '早退', detail: '早退 30 分', estimated_deduction: 0 },
  ],
}

const defaultItems: AnomalyDayCard[] = [cardLate, cardMulti, cardConfirmed]

// ── stubs ──────────────────────────────────────────────────────────────────────
const ElSelect = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue', 'change'],
  template: `<select
    :value="modelValue"
    @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"
  ><slot /></select>`,
}

const ElOption = {
  props: ['value', 'label'],
  template: `<option :value="value">{{ label }}</option>`,
}

const EmptyStateStub = {
  props: ['variant', 'title', 'description'],
  template: `<div class="empty-state-stub">{{ title }}</div>`,
}

const ElCheckbox = {
  props: ['modelValue', 'indeterminate'],
  emits: ['update:modelValue'],
  template: `<label class="el-checkbox-stub"><input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" /><slot /></label>`,
}

const ElButton = {
  props: ['type', 'disabled', 'loading', 'size', 'text'],
  emits: ['click'],
  template: `<button class="el-button" :disabled="disabled || loading" @click="!disabled && !loading && $emit('click')"><slot /></button>`,
}

const ElInput = {
  props: ['modelValue', 'placeholder', 'size'],
  emits: ['update:modelValue'],
  template: `<input class="el-input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" />`,
}

const stubs = {
  ElSelect,
  ElOption,
  EmptyState: EmptyStateStub,
  ElCheckbox,
  ElButton,
  ElInput,
}

function mountQueue(overrides: {
  items?: AnomalyDayCard[]
  selectedIndex?: number
  loading?: boolean
}) {
  return mount(AnomalyQueueColumn, {
    props: {
      items: overrides.items ?? defaultItems,
      selectedIndex: overrides.selectedIndex ?? -1,
      loading: overrides.loading ?? false,
    },
    global: {
      stubs,
      directives: {
        loading: { mounted() {}, updated() {} },
      },
    },
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('AnomalyQueueColumn', () => {
  it('預設只顯示未處理卡（statusFilter=pending）', () => {
    const wrapper = mountQueue({})
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('李缺卡')
    expect(wrapper.text()).not.toContain('陳早退')
  })

  it('日卡列出當日所有異常的 type_label（同卡多異常）', () => {
    const wrapper = mountQueue({})
    const multiRow = wrapper.findAll('.anomaly-item').find((r) => r.text().includes('李缺卡'))
    expect(multiRow?.text()).toContain('未打卡')
    expect(multiRow?.text()).toContain('遲到')
  })

  it('status filter=all → 已處理卡也顯示（篩選真的生效）', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('all')
    await nextTick()
    expect(wrapper.text()).toContain('陳早退')
    expect(wrapper.findAll('.anomaly-item').length).toBe(3)
  })

  it('status filter=confirmed → 只顯示已處理卡', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('confirmed')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('陳早退')
  })

  it('type filter：卡內任一異常符合即顯示', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('late')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    // cardLate 與 cardMulti（含 late 項）皆符合
    expect(rows.length).toBe(2)
    expect(wrapper.text()).toContain('王遲到')
    expect(wrapper.text()).toContain('李缺卡')
  })

  it('emits filterChange when status select changes, with type and status payload', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('confirmed')
    await nextTick()
    const emitted = wrapper.emitted('filterChange')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { type: string; status: string }
    expect(payload).toHaveProperty('type')
    expect(payload).toHaveProperty('status', 'confirmed')
  })

  it('emits select with ORIGINAL items index — not filtered index', async () => {
    // filter type='missing_punch' → 只剩 cardMulti（原始 index=1）
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('missing_punch')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows.length).toBe(1)
    await rows[0].trigger('click')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([1])
  })

  it('卡片扣款＝卡內項目合計（遮罩 null 不列入）', () => {
    const wrapper = mountQueue({
      items: [
        {
          ...cardMulti,
          items: [
            { type: 'late', type_label: '遲到', detail: 'x', estimated_deduction: 100 },
            { type: 'early_leave', type_label: '早退', detail: 'y', estimated_deduction: null },
          ],
        },
      ],
    })
    expect(wrapper.text()).toContain('100')
  })

  it('does NOT show deduction amount when合計為 0', () => {
    const wrapper = mountQueue({
      items: [
        {
          ...cardMulti,
          items: [
            { type: 'missing_punch', type_label: '未打卡', detail: 'x', estimated_deduction: 0 },
          ],
        },
      ],
    })
    expect(wrapper.text()).not.toContain('NT$0')
    expect(wrapper.text()).not.toContain('$0')
  })

  it('highlights the row matching selectedIndex', () => {
    const wrapper = mountQueue({ selectedIndex: 0 })
    const rows = wrapper.findAll('.anomaly-item')
    expect(rows[0].classes()).toContain('anomaly-item--selected')
    expect(rows[1].classes()).not.toContain('anomaly-item--selected')
  })

  it('shows pending marker (red dot) for cards with confirmed_action === null', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[1].setValue('all')
    await nextTick()
    const rows = wrapper.findAll('.anomaly-item')
    const lateRow = rows.find((r) => r.text().includes('王遲到'))
    expect(lateRow?.find('.anomaly-item__pending').exists()).toBe(true)
    const earlyRow = rows.find((r) => r.text().includes('陳早退'))
    expect(earlyRow?.find('.anomaly-item__pending').exists()).toBe(false)
  })

  it('shows empty state when filtered list is empty (non-loading)', async () => {
    const wrapper = mountQueue({ items: [cardLate] })
    const selects = wrapper.findAll('select')
    await selects[0].setValue('early_leave')
    await nextTick()
    const empty = wrapper.find('.empty-state-stub')
    expect(empty.exists()).toBe(true)
  })
})

// ── 多選批次處理（P?-batch-ux-tail）──────────────────────────────────────────
describe('AnomalyQueueColumn — 多選批次處理', () => {
  beforeEach(() => {
    mockBatchConfirm.mockReset().mockResolvedValue({ data: { processed: 2 } })
    mockNotify.mockReset()
    mockConfirm.mockReset().mockResolvedValue(undefined)
    ;(ElMessage.success as ReturnType<typeof vi.fn>).mockClear()
    ;(ElMessage.warning as ReturnType<typeof vi.fn>).mockClear()
    ;(ElMessage.error as ReturnType<typeof vi.fn>).mockClear()
  })

  function checkboxesOf(wrapper: ReturnType<typeof mountQueue>) {
    return wrapper.findAll('.anomaly-item__checkbox-wrap input[type="checkbox"]')
  }

  it('點選單一項目 checkbox 不觸發 select（click.stop 隔離）', async () => {
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)
    expect(wrapper.emitted('select')).toBeFalsy()
  })

  it('選取 0 筆時不顯示批次動作列；選取 >0 才顯示且計數正確', async () => {
    const wrapper = mountQueue({})
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)

    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)
    const bar = wrapper.find('.anomaly-queue-column__batch-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('批次視為正常（1）')
    expect(bar.text()).toContain('批次豁免（1）')
  })

  it('全選勾選所有可見卡片；取消全選後批次列消失', async () => {
    const wrapper = mountQueue({})
    const selectAll = wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]')
    await selectAll.setValue(true)
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toContain('已選 2 筆')

    await selectAll.setValue(false)
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)
  })

  it('批次視為正常：先跳確認對話框，確認後帶 attendance_ids/action/remark 呼叫 API', async () => {
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)

    const remarkInput = wrapper.find('.anomaly-queue-column__batch-remark')
    await remarkInput.setValue('測試備註')

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次視為正常'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockBatchConfirm).toHaveBeenCalledWith({
      attendance_ids: expect.arrayContaining([cardLate.id, cardMulti.id]),
      action: 'admin_accept',
      remark: '測試備註',
    })
  })

  it('批次豁免：不填 remark 時 payload 不帶 remark 欄位', async () => {
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)

    const waiveBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次豁免'))
    await waiveBtn!.trigger('click')
    await flushPromises()

    expect(mockBatchConfirm).toHaveBeenCalledWith({
      attendance_ids: [cardLate.id],
      action: 'admin_waive',
    })
  })

  it('成功後顯示 ElMessage.success、清空選取並 emit resolved', async () => {
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次視為正常'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith('已批次處理 2 筆')
    expect(wrapper.emitted('resolved')).toBeTruthy()
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)
  })

  it('使用者取消確認對話框（reject）不呼叫 API', async () => {
    mockConfirm.mockRejectedValueOnce('cancel')
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次視為正常'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockBatchConfirm).not.toHaveBeenCalled()
    // 選取狀態應保留（使用者可能只是想再確認一次）
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(true)
  })

  it('批次失敗（例：本人 403 / 封存月份 409）呼叫 notify 帶清楚 prefix', async () => {
    const err = {
      response: { status: 403, data: { detail: '不可批次確認自己的考勤異常' } },
    }
    mockBatchConfirm.mockRejectedValueOnce(err)
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次視為正常'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockNotify).toHaveBeenCalledWith(
      err,
      'AnomalyQueueColumn.batchConfirm',
      null,
      expect.objectContaining({ prefix: '批次處理失敗' }),
    )
    // 失敗不應清空選取或 emit resolved（讓使用者可重試）
    expect(wrapper.emitted('resolved')).toBeFalsy()
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(true)
  })

  it('選取超過 500 筆：不跳確認對話框、不呼叫 API，改 warning 提示', async () => {
    const items: AnomalyDayCard[] = Array.from({ length: 501 }, (_, i) => ({
      id: i + 1,
      employee_name: `員工${i}`,
      employee_number: `E${i}`,
      date: '2026-06-01',
      weekday: '一',
      confirmed_action: null,
      items: [{ type: 'late', type_label: '遲到', detail: 'x', estimated_deduction: 0 }],
    }))
    const wrapper = mountQueue({ items })
    const selectAll = wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]')
    await selectAll.setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次視為正常'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBatchConfirm).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('items 參考變動（父層 refresh）後清空既有選取', async () => {
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(true)

    await wrapper.setProps({ items: [...defaultItems] })
    await nextTick()
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)
  })
})
