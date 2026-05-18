/**
 * P1-6 / P1-7：BatchSignButton 失敗識別 + succeeded shape 兜底。
 *
 *  1. 後端回 `succeeded_count: N` 與 `succeeded: [..]` 兩種 shape 都
 *     正確取 count。
 *  2. 失敗清單 dialog 用 summariesMap 顯示 employee_name 而非裸 id。
 *  3. error 字串過長時被截短。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { batchSignSummariesMock, elMessage, elMessageBox } = vi.hoisted(() => ({
  batchSignSummariesMock: vi.fn(),
  elMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  elMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
}))

vi.mock('element-plus', () => ({
  ElMessage: elMessage,
  ElMessageBox: elMessageBox,
}))

vi.mock('@/api/appraisal', () => ({
  batchSignSummaries: batchSignSummariesMock,
}))

vi.mock('@/utils/error', () => ({
  apiError: (e, f) => f || 'err',
}))

import { h, provide, inject } from 'vue'
import BatchSignButton from '@/views/appraisal/components/BatchSignButton.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const tableStubs = {
  'el-table': {
    props: ['data'],
    setup(props, { slots }) {
      return () => {
        const rows = props.data || []
        return h(
          'div',
          rows.map((row) => {
            const RowProvider = {
              setup(_, { slots: rowSlots }) {
                provide('current-row', row)
                return () => h('div', rowSlots.default?.())
              },
            }
            return h(RowProvider, null, { default: () => slots.default?.() })
          }),
        )
      }
    },
  },
  'el-table-column': {
    setup(_, { slots }) {
      return () => {
        const row = inject('current-row', null)
        return h('div', slots.default ? slots.default({ row }) : null)
      }
    },
  },
}

const stubs = {
  'el-button': {
    props: ['loading', 'disabled'],
    emits: ['click'],
    template: `<button
      :data-test="$attrs['data-test']"
      :disabled="loading || disabled"
      @click="$emit('click')"
    ><slot /></button>`,
  },
  'el-dialog': transparentStub(),
  ...tableStubs,
}

const summariesMap = {
  10: { id: 10, employee_name: '張小明' },
  11: { id: 11, employee_name: '李美花' },
  12: { id: 12, employee_name: '王大華' },
}

function makeWrapper() {
  return mount(BatchSignButton, {
    props: {
      cycleId: 1,
      stage: 'SUPERVISOR',
      selectedIds: [10, 11, 12],
      summariesMap,
    },
    global: { stubs },
  })
}

async function clickAndWait(w) {
  await w.find('[data-test="batch-sign-btn"]').trigger('click')
  // confirm() Promise.resolve() then batchSignSummaries Promise
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
  await w.vm.$nextTick()
}

describe('P1-6 / P1-7 BatchSignButton', () => {
  beforeEach(() => {
    batchSignSummariesMock.mockReset()
    elMessage.warning.mockClear()
    elMessage.success.mockClear()
    elMessage.error.mockClear()
    elMessageBox.confirm.mockReturnValue(Promise.resolve())
  })

  it('後端回 succeeded_count: N 時取得正確 count（成功訊息含 N）', async () => {
    batchSignSummariesMock.mockResolvedValue({
      data: { succeeded_count: 3, failed: [] },
    })
    const w = makeWrapper()
    await clickAndWait(w)
    expect(elMessage.success).toHaveBeenCalledWith('已完成 3 筆')
  })

  it('後端回 succeeded: [...] array 時取得正確 count', async () => {
    batchSignSummariesMock.mockResolvedValue({
      data: { succeeded: [{ id: 10 }, { id: 11 }, { id: 12 }], failed: [] },
    })
    const w = makeWrapper()
    await clickAndWait(w)
    expect(elMessage.success).toHaveBeenCalledWith('已完成 3 筆')
  })

  it('部分失敗時 dialog 顯示 employee_name 而非裸 summary_id', async () => {
    batchSignSummariesMock.mockResolvedValue({
      data: {
        succeeded_count: 1,
        failed: [
          { summary_id: 11, error: 'StaleObjectError: 樂觀鎖衝突' },
          { summary_id: 12, error: 'Permission denied' },
        ],
      },
    })
    const w = makeWrapper()
    await clickAndWait(w)
    // dialog rendered
    expect(w.find('[data-test="failed-name-11"]').text()).toBe('李美花')
    expect(w.find('[data-test="failed-name-12"]').text()).toBe('王大華')
    // warning 訊息：成功 1 失敗 2
    expect(elMessage.warning).toHaveBeenCalledWith(
      expect.stringContaining('成功 1 筆'),
    )
  })

  it('error 字串過長時被截短至 120 字以內', async () => {
    const longError = 'A'.repeat(200) + ' tail'
    batchSignSummariesMock.mockResolvedValue({
      data: {
        succeeded_count: 0,
        failed: [{ summary_id: 11, error: longError }],
      },
    })
    const w = makeWrapper()
    await clickAndWait(w)
    const text = w.find('[data-test="failed-error-11"]').text()
    expect(text.length).toBeLessThanOrEqual(121) // 120 + 省略號
    expect(text.endsWith('…')).toBe(true)
  })

  it('summariesMap 沒這筆 summary 時 fallback 為 #id', async () => {
    batchSignSummariesMock.mockResolvedValue({
      data: {
        succeeded_count: 0,
        failed: [{ summary_id: 999, error: 'x' }],
      },
    })
    const w = mount(BatchSignButton, {
      props: {
        cycleId: 1,
        stage: 'SUPERVISOR',
        selectedIds: [999],
        summariesMap: {},
      },
      global: { stubs },
    })
    await clickAndWait(w)
    expect(w.find('[data-test="failed-name-999"]').text()).toBe('#999')
  })
})
