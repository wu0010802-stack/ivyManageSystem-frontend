import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, type VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const { mockBatch, mockNotify, mockMessage, mockSuccess, mockWarning, mockClose } = vi.hoisted(() => {
  const close = vi.fn()
  return {
    mockBatch: vi.fn(),
    mockNotify: vi.fn(),
    mockClose: close,
    mockSuccess: vi.fn(),
    mockWarning: vi.fn(),
    mockMessage: vi.fn(() => ({ close })),
  }
})

vi.mock('@/api/attendance', () => ({ batchConfirmAnomalies: mockBatch }))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: mockNotify }) }))
vi.mock('element-plus', () => ({ ElMessage: Object.assign(mockMessage, { success: mockSuccess, warning: mockWarning }) }))

import { confirmedFollowUp, showUndoToast } from '../useConfirmUndo'

type MessageOptions = { message: () => VNode; duration: number; onClose: () => void }

/** 取出 showUndoToast 交給 ElMessage 的選項，並把 message 渲染成真的 DOM 以便點按鈕 */
function openToast(ids = [11, 12, 13], onUndone = vi.fn()) {
  showUndoToast({ text: '已批次處理 3 件', attendanceIds: ids, onUndone })
  const options = (mockMessage.mock.calls.at(-1) as unknown as [MessageOptions])[0]
  const wrapper = mount(defineComponent({ render: () => options.message() }))
  return { options, wrapper, onUndone, button: () => wrapper.get('button') }
}

describe('showUndoToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatch.mockResolvedValue({ data: { processed: 3 } })
  })

  it('訊息留 10 秒，內含文字與「復原」按鈕', () => {
    const { options, wrapper, button } = openToast()
    expect(options.duration).toBe(10000)
    expect(wrapper.text()).toContain('已批次處理 3 件')
    expect(button().text()).toBe('復原')
    expect(mockBatch).not.toHaveBeenCalled()
  })

  it('點復原：呼叫一次 clear 帶全部 id，成功顯示「已復原」並呼叫 onUndone', async () => {
    const { button, onUndone } = openToast([11, 12, 13])
    await button().trigger('click')
    await flushPromises()
    expect(mockBatch).toHaveBeenCalledTimes(1)
    expect(mockBatch).toHaveBeenCalledWith({ attendance_ids: [11, 12, 13], action: 'clear' })
    expect(mockSuccess).toHaveBeenCalledWith('已復原')
    expect(onUndone).toHaveBeenCalledTimes(1)
  })

  it('點一次後按鈕立即停用，再點不重送', async () => {
    let finish: (v: unknown) => void = () => {}
    mockBatch.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { button, onUndone } = openToast()
    await button().trigger('click')
    // 請求還在途時就已停用
    expect(button().attributes('disabled')).toBeDefined()
    await button().trigger('click')
    expect(mockBatch).toHaveBeenCalledTimes(1)
    finish({ data: { processed: 3 } })
    await flushPromises()
    await button().trigger('click')
    expect(mockBatch).toHaveBeenCalledTimes(1)
    expect(onUndone).toHaveBeenCalledTimes(1)
  })

  it('訊息關閉後即使按鈕還在也不再送', async () => {
    const { options, button, onUndone } = openToast()
    options.onClose()
    await button().trigger('click')
    await flushPromises()
    expect(mockBatch).not.toHaveBeenCalled()
    expect(onUndone).not.toHaveBeenCalled()
  })

  it('復原失敗：用既有錯誤顯示，不呼叫 onUndone、也不顯示已復原', async () => {
    const err = { response: { status: 409, data: { detail: '薪資已封存' } } }
    mockBatch.mockRejectedValue(err)
    const { button, onUndone } = openToast()
    await button().trigger('click')
    await flushPromises()
    expect(mockNotify).toHaveBeenCalledWith(err, 'useConfirmUndo.undo', null, expect.objectContaining({ prefix: '復原失敗' }))
    expect(mockSuccess).not.toHaveBeenCalled()
    expect(onUndone).not.toHaveBeenCalled()
  })

  it('處理完（成功或失敗）就收起訊息，不留一顆已停用的按鈕', async () => {
    const { button } = openToast()
    await button().trigger('click')
    await flushPromises()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  describe('復原的結果照 processed 實話實說（clear 只清沒被別人改過的列）', () => {
    it('processed 等於送出的件數：已復原', async () => {
      mockBatch.mockResolvedValue({ data: { processed: 3 } })
      const { button, onUndone } = openToast([11, 12, 13])
      await button().trigger('click')
      await flushPromises()
      expect(mockSuccess).toHaveBeenCalledWith('已復原')
      expect(mockWarning).not.toHaveBeenCalled()
      expect(onUndone).toHaveBeenCalledTimes(1)
    })

    it('processed 少於送出的件數：寫已復原幾件、另幾件已被其他人改動（仍重抓資料）', async () => {
      mockBatch.mockResolvedValue({ data: { processed: 2 } })
      const { button, onUndone } = openToast([11, 12, 13])
      await button().trigger('click')
      await flushPromises()
      expect(mockWarning).toHaveBeenCalledWith('已復原 2 件，另 1 件已被其他人改動')
      expect(mockSuccess).not.toHaveBeenCalled()
      expect(onUndone).toHaveBeenCalledTimes(1)
    })

    it('processed 為 0：沒有復原任何一件，不能寫成已復原（仍重抓資料）', async () => {
      mockBatch.mockResolvedValue({ data: { processed: 0 } })
      const { button, onUndone } = openToast([11, 12, 13])
      await button().trigger('click')
      await flushPromises()
      expect(mockWarning).toHaveBeenCalledWith('沒有復原任何一件，都已被其他人改動')
      expect(mockSuccess).not.toHaveBeenCalled()
      expect(onUndone).toHaveBeenCalledTimes(1)
    })
  })
})

describe('confirmedFollowUp：接受扣款／豁免成功後給不給復原（只看後端回的 undoable_ids）', () => {
  it('undoable_ids 涵蓋這次全部 processed：給復原，復原送的就是 undoable_ids', () => {
    expect(confirmedFollowUp({ processed: 3, undoable_ids: [11, 12, 13] })).toEqual({ undoIds: [11, 12, 13], note: '' })
  })

  it('undoable_ids 少於 processed：不給復原，說明其中幾件原本已有處理、無法復原', () => {
    expect(confirmedFollowUp({ processed: 3, undoable_ids: [11, 12] })).toEqual({ undoIds: null, note: '。其中 1 件原本已有處理，無法復原' })
    expect(confirmedFollowUp({ processed: 3, undoable_ids: [] })).toEqual({ undoIds: null, note: '。其中 3 件原本已有處理，無法復原' })
  })

  it('沒帶 undoable_ids（選填欄位）當成空清單', () => {
    expect(confirmedFollowUp({ processed: 2 })).toEqual({ undoIds: null, note: '。其中 2 件原本已有處理，無法復原' })
  })

  it('processed 為 0：沒有東西可復原也沒有件數可說明，只給一般成功訊息', () => {
    expect(confirmedFollowUp({ processed: 0, undoable_ids: [] })).toEqual({ undoIds: null, note: '' })
  })

  it('undoable_ids 比 processed 多（不應發生）：不給復原，也不寫負數件數', () => {
    expect(confirmedFollowUp({ processed: 1, undoable_ids: [11, 12] })).toEqual({ undoIds: null, note: '' })
  })
})
