// src/components/attendance/__tests__/AnomalyQueueColumn.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

// ── hoisted mocks（多選批次處理：直接呼叫 API，需 mock）─────────────────────────
const { mockBatchConfirm, mockNotify, mockConfirm, mockShowUndo } = vi.hoisted(() => ({
  mockBatchConfirm: vi.fn().mockResolvedValue({ data: { processed: 0 } }),
  mockNotify: vi.fn(),
  mockConfirm: vi.fn().mockResolvedValue(undefined),
  mockShowUndo: vi.fn(),
}))

// 批次成功後的「復原」提示（showUndoToast 自己有測試）：這裡只看交給它的文字與 id；
// 給不給復原的判斷（confirmedFollowUp）用真的，因為那是這個元件要驗證的行為
vi.mock('@/composables/useConfirmUndo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useConfirmUndo')>()),
  showUndoToast: (...args: unknown[]) => mockShowUndo(...args),
}))

vi.mock('@/api/attendance', () => ({
  batchConfirmAnomalies: mockBatchConfirm,
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: mockNotify }),
}))

// 批次接受／豁免需 ATTENDANCE_WRITE（與單筆的 ResolveCard 同一把尺）；
// 預設給有權限，唯讀情境由專屬案例覆寫。
const { mockHasPermission } = vi.hoisted(() => ({ mockHasPermission: vi.fn(() => true) }))
vi.mock('@/utils/auth', () => ({ hasPermission: (name: string) => mockHasPermission(name) }))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: (...args: unknown[]) => mockConfirm(...args) },
}))

import { ElMessage } from 'element-plus'
import AnomalyQueueColumn from '../AnomalyQueueColumn.vue'
import { computed } from 'vue'
import { GRID_VERDICT_KEY, type GridVerdictLookup } from '@/composables/useGridVerdict'

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
  props: ['modelValue', 'indeterminate', 'disabled'],
  emits: ['update:modelValue'],
  template: `<label class="el-checkbox-stub"><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.checked)" /><slot /></label>`,
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

/** 員工編號對應員工 id（異常日卡只有編號；封存名單是員工 id） */
const idByNumber = new Map([['E001', 1], ['E002', 2], ['E003', 3]])

function mountQueue(overrides: {
  items?: AnomalyDayCard[]
  selectedIndex?: number
  loading?: boolean
  sealedEmployeeIds?: ReadonlySet<number>
}) {
  return mount(AnomalyQueueColumn, {
    props: {
      items: overrides.items ?? defaultItems,
      selectedIndex: overrides.selectedIndex ?? -1,
      loading: overrides.loading ?? false,
      ...(overrides.sealedEmployeeIds ? { sealedEmployeeIds: overrides.sealedEmployeeIds, employeeIdByNumber: idByNumber } : {}),
    },
    global: {
      stubs,
      directives: {
        loading: { mounted() {}, updated() {} },
      },
    },
  })
}

/** 確認框的內文：可能是字串，也可能是分行的 VNode；攤平成一段文字（行與行以換行隔開）供斷言 */
function confirmText(message: unknown): string {
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.map(confirmText).join('\n')
  const node = message as { children?: unknown } | null
  return node && typeof node === 'object' && 'children' in node ? confirmText(node.children) : ''
}
const lastConfirmText = () => confirmText(mockConfirm.mock.calls.at(-1)![0])

// ── tests ──────────────────────────────────────────────────────────────────────
describe('AnomalyQueueColumn — 寫入權限', () => {
  it('唯讀帳號不顯示全選列與批次動作（過去是按下去才被後端 403）', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mountQueue({})
    await nextTick()
    expect(wrapper.find('.anomaly-queue-column__select-all').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('批次接受扣款')
    expect(wrapper.text()).not.toContain('批次豁免')
    mockHasPermission.mockReturnValue(true)
  })

  it('有 ATTENDANCE_WRITE 時全選列照常顯示', async () => {
    const wrapper = mountQueue({})
    await nextTick()
    expect(wrapper.find('.anomaly-queue-column__select-all').exists()).toBe(true)
    expect(mockHasPermission).toHaveBeenCalledWith('ATTENDANCE_WRITE')
  })
})

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

  it('選取 0 件時不顯示批次動作列；選取 >0 才顯示且計數正確', async () => {
    const wrapper = mountQueue({})
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)

    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)
    const bar = wrapper.find('.anomaly-queue-column__batch-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('批次接受扣款（1）')
    expect(bar.text()).toContain('批次豁免（1）')
  })

  it('全選勾選所有可見卡片；取消全選後批次列消失', async () => {
    const wrapper = mountQueue({})
    const selectAll = wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]')
    await selectAll.setValue(true)
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toContain('已選 2 件')

    await selectAll.setValue(false)
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)
  })

  it('批次接受扣款：先跳確認對話框，確認後帶 attendance_ids/action/remark 呼叫 API', async () => {
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)

    const remarkInput = wrapper.find('.anomaly-queue-column__batch-remark')
    await remarkInput.setValue('測試備註')

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次接受扣款'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(lastConfirmText()).toContain('接受扣款仍依原規則計算扣款')
    expect(mockBatchConfirm).toHaveBeenCalledWith({
      attendance_ids: expect.arrayContaining([cardLate.id, cardMulti.id]),
      action: 'admin_accept',
      remark: '測試備註',
    })
  })

  it('批次接受：不填 remark 時 payload 不帶 remark 欄位', async () => {
    const wrapper = mountQueue({})
    await checkboxesOf(wrapper)[0].setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次接受扣款'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockBatchConfirm).toHaveBeenCalledWith({
      attendance_ids: [cardLate.id],
      action: 'admin_accept',
    })
  })

  it('批次豁免要填理由：備註是空的（或只有空白）不開確認框、不呼叫 API，欄位下方寫「豁免要填理由」', async () => {
    const wrapper = mountQueue({})
    await checkboxesOf(wrapper)[0].setValue(true)
    expect(wrapper.text()).not.toContain('豁免要填理由')

    const waive = () => wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次豁免'))!
    await waive().trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="batch-remark-error"]').text()).toBe('豁免要填理由')
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBatchConfirm).not.toHaveBeenCalled()

    await wrapper.find('.anomaly-queue-column__batch-remark').setValue('   ')
    await waive().trigger('click')
    await flushPromises()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBatchConfirm).not.toHaveBeenCalled()
  })

  it('填了理由就消去提示；豁免照常帶 remark 送出', async () => {
    const wrapper = mountQueue({})
    await checkboxesOf(wrapper)[0].setValue(true)
    const waive = () => wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次豁免'))!
    await waive().trigger('click')
    expect(wrapper.find('[data-test="batch-remark-error"]').exists()).toBe(true)

    await wrapper.find('.anomaly-queue-column__batch-remark').setValue('颱風天')
    expect(wrapper.find('[data-test="batch-remark-error"]').exists()).toBe(false)
    await waive().trigger('click')
    await flushPromises()
    expect(mockBatchConfirm).toHaveBeenCalledWith({ attendance_ids: [cardLate.id], action: 'admin_waive', remark: '颱風天' })
  })

  it('批次接受不需要理由，空備註也不顯示提示', async () => {
    const wrapper = mountQueue({})
    await checkboxesOf(wrapper)[0].setValue(true)
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="batch-remark-error"]').exists()).toBe(false)
    expect(mockBatchConfirm).toHaveBeenCalledTimes(1)
  })

  it('成功後改用可復原的提示（寫處理件數與 id）、清空選取並 emit resolved', async () => {
    mockBatchConfirm.mockResolvedValue({ data: { processed: 1, undoable_ids: [cardLate.id] } })
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次接受扣款'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockShowUndo).toHaveBeenCalledTimes(1)
    expect(mockShowUndo).toHaveBeenCalledWith({ text: '已批次處理 1 件', attendanceIds: [cardLate.id], onUndone: expect.any(Function) })
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(wrapper.emitted('resolved')).toBeTruthy()
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)
  })

  it('復原成功（onUndone）後 emit resolved 讓父層重抓', async () => {
    mockBatchConfirm.mockResolvedValue({ data: { processed: 1, undoable_ids: [cardLate.id] } })
    const wrapper = mountQueue({})
    await checkboxesOf(wrapper)[0].setValue(true)
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    const afterBatch = wrapper.emitted('resolved')!.length
    ;(mockShowUndo.mock.calls[0][0] as { onUndone: () => void }).onUndone()
    expect(wrapper.emitted('resolved')!.length).toBe(afterBatch + 1)
  })

  it('全部可復原：復原送出的是後端回的 undoable_ids（不是前端選取的清單）', async () => {
    mockBatchConfirm.mockResolvedValue({ data: { processed: 2, undoable_ids: [cardMulti.id, cardLate.id] } })
    const wrapper = mountQueue({})
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toContain('已選 2 件')
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockShowUndo).toHaveBeenCalledTimes(1)
    expect(mockShowUndo).toHaveBeenCalledWith({ text: '已批次處理 2 件', attendanceIds: [cardMulti.id, cardLate.id], onUndone: expect.any(Function) })
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('後端回的 undoable_ids 少於 processed（其中有原本已有處理的）：沒有復原鈕，訊息說明幾件無法復原', async () => {
    // 選了 3 件（含一件原本就已處理），後端 processed 3 但只有 2 件可復原
    mockBatchConfirm.mockResolvedValue({ data: { processed: 3, undoable_ids: [cardLate.id, cardMulti.id] } })
    const wrapper = mountQueue({})
    await wrapper.findAll('select')[1].setValue('all')
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toContain('已選 3 件')
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockShowUndo).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已批次處理 3 件。其中 1 件原本已有處理，無法復原')
    expect(wrapper.emitted('resolved')).toBeTruthy()
  })

  it('不再用前端的 confirmed_action 快照判斷：選的卡看起來未處理，但後端說都不能復原就不給復原', async () => {
    // 員工在這之間自己處理過（前端清單還沒更新，confirmed_action 仍是 null）
    mockBatchConfirm.mockResolvedValue({ data: { processed: 2, undoable_ids: [] } })
    const wrapper = mountQueue({})
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockShowUndo).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已批次處理 2 件。其中 2 件原本已有處理，無法復原')
  })

  it('使用者取消確認對話框（reject）不呼叫 API', async () => {
    mockConfirm.mockRejectedValueOnce('cancel')
    const wrapper = mountQueue({})
    const boxes = checkboxesOf(wrapper)
    await boxes[0].setValue(true)

    const acceptBtn = wrapper
      .findAll('.anomaly-queue-column__batch-bar button')
      .find((b) => b.text().includes('批次接受扣款'))
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
      .find((b) => b.text().includes('批次接受扣款'))
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

  it('選取超過 500 件：不跳確認對話框、不呼叫 API，改 warning 提示', async () => {
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
      .find((b) => b.text().includes('批次接受扣款'))
    await acceptBtn!.trigger('click')
    await flushPromises()

    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockBatchConfirm).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('一次最多批次處理 500 件，請分批選取')
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

// ── 鍵盤操作：WAI-ARIA listbox + roving tabindex ─────────────────────────────
describe('AnomalyQueueColumn — 鍵盤操作（listbox / roving tabindex）', () => {
  const mountAttached = (overrides: Parameters<typeof mountQueue>[0] = {}) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mountQueue(overrides)
    host.appendChild(wrapper.element)
    return { wrapper, host }
  }
  const options = (wrapper: ReturnType<typeof mountQueue>) => wrapper.findAll('[role="option"]')

  it('容器是 listbox 且有名稱；option 是卡片內容區，li 為純展示', () => {
    const wrapper = mountQueue({})
    expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe('異常佇列')
    expect(wrapper.findAll('.anomaly-item').every((li) => li.attributes('role') === 'presentation')).toBe(true)
    expect(options(wrapper)).toHaveLength(2) // 預設只顯示未處理的兩張
    wrapper.unmount()
  })

  it('checkbox 在 option 之外，仍是獨立的可 Tab 控制項（不被 roving 吃掉）', () => {
    const wrapper = mountQueue({})
    for (const li of wrapper.findAll('.anomaly-item')) {
      const box = li.find('input[type="checkbox"]')
      expect(box.exists()).toBe(true)
      // option 內不可有可聚焦子孫（ARIA：option 的子層是純展示）
      expect(li.find('[role="option"] input').exists()).toBe(false)
      // checkbox 沒被設 tabindex=-1，維持預設可 Tab
      expect(box.attributes('tabindex')).toBeUndefined()
    }
    wrapper.unmount()
  })

  it('checkbox 的可存取名稱帶出員工與日期（不再是千篇一律的「選取此筆異常」）', () => {
    const wrapper = mountQueue({})
    const labels = wrapper
      .findAll('.anomaly-item__checkbox-wrap > *')
      .map((el) => el.attributes('aria-label'))
    expect(labels).toEqual(['選取 王遲到 2026-06-01 的異常', '選取 李缺卡 2026-06-02 的異常'])
    wrapper.unmount()
  })

  it('roving tabindex：沒有選取時第一張 tabindex=0，其餘 -1', () => {
    const wrapper = mountQueue({})
    expect(options(wrapper).map((o) => o.attributes('tabindex'))).toEqual(['0', '-1'])
    wrapper.unmount()
  })

  it('roving tabindex：Tab 停點落在選取卡（以原始 index 對應），aria-selected 同步', () => {
    const wrapper = mountQueue({ selectedIndex: 1 })
    const opts = options(wrapper)
    expect(opts.map((o) => o.attributes('tabindex'))).toEqual(['-1', '0'])
    expect(opts.map((o) => o.attributes('aria-selected'))).toEqual(['false', 'true'])
    wrapper.unmount()
  })

  it('Enter / Space 以原始 index emit select（篩選後也不偏移）', async () => {
    const wrapper = mountQueue({})
    const selects = wrapper.findAll('select')
    await selects[0].setValue('missing_punch') // 只剩 cardMulti（原始 index=1）
    await nextTick()
    const opt = options(wrapper)[0]
    await opt.trigger('keydown', { key: 'Enter' })
    await opt.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('select')).toEqual([[1], [1]])
    wrapper.unmount()
  })

  it('Space 的預設捲動行為被擋下', () => {
    const wrapper = mountQueue({})
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    options(wrapper)[0].element.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('↓／↑／Home／End 移動焦點與 Tab 停點，且不誤觸 select', async () => {
    const { wrapper, host } = mountAttached()
    const opts = () => options(wrapper)
    ;(opts()[0].element as HTMLElement).focus()
    await opts()[0].trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts()[1].element)
    expect(opts().map((o) => o.attributes('tabindex'))).toEqual(['-1', '0'])
    // 到底不循環
    await opts()[1].trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts()[1].element)
    await opts()[1].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(opts()[0].element)
    await opts()[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(opts()[1].element)
    await opts()[1].trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(opts()[0].element)
    expect(wrapper.emitted('select')).toBeFalsy()
    wrapper.unmount()
    host.remove()
  })

  it('點 option 本身只 emit 一次 select（冒泡到 li 的單一 handler）', async () => {
    const wrapper = mountQueue({})
    await options(wrapper)[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1]])
    wrapper.unmount()
  })

  it('未處理紅點是 role=img 並帶「未處理」名稱，已處理卡沒有', async () => {
    const wrapper = mountQueue({})
    await wrapper.findAll('select')[1].setValue('all')
    await nextTick()
    const dots = wrapper.findAll('.anomaly-item__pending')
    expect(dots).toHaveLength(2)
    for (const dot of dots) {
      expect(dot.attributes('role')).toBe('img')
      expect(dot.attributes('aria-label')).toBe('未處理')
    }
    wrapper.unmount()
  })
})

describe('批次接受扣款也寫出班表核對看得到的風險（獨立審查 F6）', () => {
  beforeEach(() => {
    mockConfirm.mockReset()
    mockConfirm.mockResolvedValue('confirm')
  })

  it('選取裡有整月同型態或疑似換班的日卡：確認文字寫出筆數；豁免不寫', async () => {
    const lookup: GridVerdictLookup = (_id, date, number) => {
      if (number === 'E002' && date === cardLate.date) return { label: '遲到 57 分', status: 'anomaly', acceptWarning: '設定問題' }
      if (number === 'E003' && date === cardMulti.date) return { label: '疑似換班', status: 'possible_shift_change', acceptWarning: null }
      return null
    }
    const mountWithVerdict = () => mount(AnomalyQueueColumn, {
      props: { items: defaultItems, selectedIndex: -1, loading: false },
      global: { stubs, directives: { loading: { mounted() {}, updated() {} } }, provide: { [GRID_VERDICT_KEY as symbol]: computed(() => lookup) } },
    })
    const clickBatch = async (label: string) => {
      const wrapper = mountWithVerdict()
      const boxes = wrapper.findAll('.anomaly-item__checkbox-wrap input[type="checkbox"]')
      await boxes[0].setValue(true)
      await boxes[1].setValue(true)
      // 豁免要填理由才會開確認框
      await wrapper.find('.anomaly-queue-column__batch-remark').setValue('測試理由')
      await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes(label))!.trigger('click')
      await flushPromises()
      return lastConfirmText()
    }
    const accept = await clickBatch('批次接受扣款')
    expect(accept).toContain('1 件是整月同型態')
    expect(accept).toContain('1 件核對判定為疑似換班')
    expect(accept).not.toContain('班表核對')
    expect(await clickBatch('批次豁免')).not.toContain('整月同型態')
  })
})


describe('AnomalyQueueColumn — 批次接受的合計與封存員工', () => {
  beforeEach(() => {
    mockBatchConfirm.mockReset().mockResolvedValue({ data: { processed: 2 } })
    mockConfirm.mockReset().mockResolvedValue(undefined)
    mockShowUndo.mockReset()
    mockHasPermission.mockReturnValue(true)
  })

  const boxesOf = (wrapper: ReturnType<typeof mountQueue>) => wrapper.findAll('.anomaly-item__checkbox-wrap input[type="checkbox"]')
  const clickBatch = async (wrapper: ReturnType<typeof mountQueue>, label: string) => {
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes(label))!.trigger('click')
    await flushPromises()
  }

  it('接受確認框加一行合計：選取日卡預估扣款加總，人數是不同員工數', async () => {
    const wrapper = mountQueue({})
    await boxesOf(wrapper)[0].setValue(true) // E002 300
    await boxesOf(wrapper)[1].setValue(true) // E003 100
    await clickBatch(wrapper, '批次接受扣款')
    const lines = lastConfirmText().split('\n')
    expect(lines.at(-1)).toBe('合計 NT$400（2 人）')
  })

  it('同一個人多天只算一人；金額千分位', async () => {
    const big = (id: number, date: string): AnomalyDayCard => ({ ...cardLate, id, date, items: [{ type: 'late', type_label: '遲到', detail: 'x', estimated_deduction: 600 }, { type: 'early_leave', type_label: '早退', detail: 'y', estimated_deduction: 400 }] })
    const wrapper = mountQueue({ items: [big(1, '2026-06-01'), big(2, '2026-06-02')] })
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    await clickBatch(wrapper, '批次接受扣款')
    expect(lastConfirmText()).toContain('合計 NT$2,000（1 人）')
  })

  it('合計是 0（或遮罩 null）就省略整行；豁免不寫合計', async () => {
    const zero: AnomalyDayCard = { ...cardLate, items: [{ type: 'late', type_label: '遲到', detail: 'x', estimated_deduction: 0 }, { type: 'early_leave', type_label: '早退', detail: 'y', estimated_deduction: null }] }
    const wrapper = mountQueue({ items: [zero] })
    await boxesOf(wrapper)[0].setValue(true)
    await clickBatch(wrapper, '批次接受扣款')
    expect(lastConfirmText()).not.toContain('合計')

    mockConfirm.mockClear()
    const paid = mountQueue({})
    await boxesOf(paid)[0].setValue(true)
    await paid.find('.anomaly-queue-column__batch-remark').setValue('颱風天')
    await clickBatch(paid, '批次豁免')
    expect(lastConfirmText()).not.toContain('合計')
  })

  describe('封存月的員工只能看', () => {
    const sealed = new Set([2]) // E002（王遲到）薪資已封存

    it('封存員工的核取框停用；其他人照常', () => {
      const wrapper = mountQueue({ sealedEmployeeIds: sealed })
      const boxes = boxesOf(wrapper)
      expect(boxes[0].attributes('disabled')).toBeDefined() // cardLate E002
      expect(boxes[1].attributes('disabled')).toBeUndefined() // cardMulti E003
    })

    it('全選不含封存項，全選列與已選數只算能處理的', async () => {
      const wrapper = mountQueue({ sealedEmployeeIds: sealed })
      expect(wrapper.find('.anomaly-queue-column__select-all').text()).toContain('全選目前篩選結果（1）')
      await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
      expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toContain('已選 1 件')
      await clickBatch(wrapper, '批次接受扣款')
      expect(mockBatchConfirm).toHaveBeenCalledWith({ attendance_ids: [cardMulti.id], action: 'admin_accept' })
    })

    it('清單上方寫「已封存的 k 件只能看」；沒有封存項時不顯示', () => {
      const wrapper = mountQueue({ sealedEmployeeIds: sealed })
      expect(wrapper.get('[data-test="sealed-note"]').text()).toBe('已封存的 1 件只能看')
      expect(mountQueue({}).find('[data-test="sealed-note"]').exists()).toBe(false)
    })

    it('封存項仍列在清單上（看得到、點得開）', async () => {
      const wrapper = mountQueue({ sealedEmployeeIds: sealed })
      expect(wrapper.text()).toContain('王遲到')
      await wrapper.findAll('.anomaly-item__option')[0].trigger('click')
      expect(wrapper.emitted('select')).toEqual([[0]])
    })

    it('全部都封存：不顯示全選列', () => {
      const wrapper = mountQueue({ items: [cardLate], sealedEmployeeIds: sealed })
      expect(wrapper.find('.anomaly-queue-column__select-all').exists()).toBe(false)
      expect(wrapper.get('[data-test="sealed-note"]').text()).toBe('已封存的 1 件只能看')
    })
  })
})


describe('AnomalyQueueColumn — 件數用語與封存名單變動（R27）', () => {
  beforeEach(() => {
    mockBatchConfirm.mockReset().mockResolvedValue({ data: { processed: 2 } })
    mockConfirm.mockReset().mockResolvedValue(undefined)
    mockShowUndo.mockReset()
    mockHasPermission.mockReturnValue(true)
    ;(ElMessage.success as ReturnType<typeof vi.fn>).mockClear()
  })
  const boxesOf = (wrapper: ReturnType<typeof mountQueue>) => wrapper.findAll('.anomaly-item__checkbox-wrap input[type="checkbox"]')

  it('畫面上的數量一律用「件」：全選列、已選、確認框、風險提示都沒有「筆」', async () => {
    const lookup: GridVerdictLookup = (_id, date, number) => {
      if (number === 'E002' && date === cardLate.date) return { label: '遲到 57 分', status: 'anomaly', acceptWarning: '設定問題' }
      if (number === 'E003' && date === cardMulti.date) return { label: '疑似換班', status: 'possible_shift_change', acceptWarning: null }
      return null
    }
    const wrapper = mount(AnomalyQueueColumn, {
      props: { items: defaultItems, selectedIndex: -1, loading: false },
      global: { stubs, directives: { loading: { mounted() {}, updated() {} } }, provide: { [GRID_VERDICT_KEY as symbol]: computed(() => lookup) } },
    })
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.anomaly-queue-column__select-all').text()).not.toContain('筆')
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toBe('已選 2 件')
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    const text = lastConfirmText()
    expect(text).toContain('選取的 2 件考勤異常')
    expect(text).not.toContain('筆')
  })

  it('勾選之後該員工變成封存：從選取中移除、已選數下降，送出的 payload 不含他', async () => {
    const wrapper = mount(AnomalyQueueColumn, {
      props: { items: defaultItems, selectedIndex: -1, loading: false, sealedEmployeeIds: new Set<number>(), employeeIdByNumber: idByNumber },
      global: { stubs, directives: { loading: { mounted() {}, updated() {} } } },
    })
    await boxesOf(wrapper)[0].setValue(true) // E002 王遲到
    await boxesOf(wrapper)[1].setValue(true) // E003 李缺卡
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toBe('已選 2 件')
    expect(wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.text()).toContain('（2）')

    await wrapper.setProps({ sealedEmployeeIds: new Set([2]) }) // 月摘要晚到：E002 整月封存
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toBe('已選 1 件')
    expect(wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.text()).toContain('（1）')
    expect(boxesOf(wrapper)[0].element.checked).toBe(false)

    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockBatchConfirm).toHaveBeenCalledWith({ attendance_ids: [cardMulti.id], action: 'admin_accept' })
  })

  it('員工編號對照晚到而讓選取的人變成封存，同樣會被移除；選的都是封存就收起批次列', async () => {
    const wrapper = mount(AnomalyQueueColumn, {
      props: { items: defaultItems, selectedIndex: -1, loading: false, sealedEmployeeIds: new Set([2]) },
      global: { stubs, directives: { loading: { mounted() {}, updated() {} } } },
    })
    await boxesOf(wrapper)[0].setValue(true) // 對照還沒到，E002 對不到 id＝當作沒封存
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(true)
    await wrapper.setProps({ employeeIdByNumber: idByNumber })
    expect(wrapper.find('.anomaly-queue-column__batch-bar').exists()).toBe(false)
    expect(wrapper.find('.anomaly-queue-column__selected-count').exists()).toBe(false)
  })

  it('封存名單變動但沒影響到已選的人：選取不動', async () => {
    const wrapper = mount(AnomalyQueueColumn, {
      props: { items: defaultItems, selectedIndex: -1, loading: false, sealedEmployeeIds: new Set<number>(), employeeIdByNumber: idByNumber },
      global: { stubs, directives: { loading: { mounted() {}, updated() {} } } },
    })
    await boxesOf(wrapper)[1].setValue(true) // E003
    await wrapper.setProps({ sealedEmployeeIds: new Set([2]) })
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toBe('已選 1 件')
  })

  it('批次成功但實際處理 0 件（例如那幾件已不存在或已變更）：改顯示警告請重新整理，不顯示成功、不出現復原提示', async () => {
    mockBatchConfirm.mockResolvedValue({ data: { processed: 0 } })
    const wrapper = mountQueue({})
    await boxesOf(wrapper)[0].setValue(true)
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockShowUndo).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('選取的 1 件都已不存在或已變更，沒有處理任何一件，請重新整理')
    expect(wrapper.emitted('resolved')).toBeTruthy()
  })

  it('部分處理（processed 少於選取件數）、其餘不可復原：顯示警告並說明其餘件數已不存在或已變更', async () => {
    mockBatchConfirm.mockResolvedValue({ data: { processed: 1, undoable_ids: [] } })
    const wrapper = mountQueue({})
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.anomaly-queue-column__selected-count').text()).toContain('已選 2 件')
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockShowUndo).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('已批次處理 1 件。其中 1 件原本已有處理，無法復原。另 1 件已不存在或已變更，請重新整理')
    expect(wrapper.emitted('resolved')).toBeTruthy()
  })

  it('部分處理但處理到的都可復原：仍給復原提示，文字說明其餘件數已不存在或已變更', async () => {
    mockBatchConfirm.mockResolvedValue({ data: { processed: 1, undoable_ids: [cardLate.id] } })
    const wrapper = mountQueue({})
    await wrapper.find('.anomaly-queue-column__select-all input[type="checkbox"]').setValue(true)
    await wrapper.findAll('.anomaly-queue-column__batch-bar button').find((b) => b.text().includes('批次接受扣款'))!.trigger('click')
    await flushPromises()
    expect(mockShowUndo).toHaveBeenCalledWith({
      text: '已批次處理 1 件。另 1 件已不存在或已變更，請重新整理',
      attendanceIds: [cardLate.id],
      onUndone: expect.any(Function),
    })
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
