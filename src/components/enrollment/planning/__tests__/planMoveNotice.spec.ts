import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VNode } from 'vue'

const { mockNotification, mockClose } = vi.hoisted(() => {
  const mockClose = vi.fn()
  return { mockClose, mockNotification: vi.fn(() => ({ close: mockClose })) }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElNotification: mockNotification }
})

import ElementPlus from 'element-plus'
import { showMoveNotice } from '../planMoveNotice'

interface NotifyOptions {
  message: VNode
  duration: number
  type: string
}

function lastOptions(): NotifyOptions {
  return mockNotification.mock.calls.at(-1)![0] as unknown as NotifyOptions
}

function renderMessage() {
  return mount({ render: () => lastOptions().message }, { global: { plugins: [ElementPlus] } })
}

describe('showMoveNotice', () => {
  beforeEach(() => vi.clearAllMocks())

  it('成功通知停留 8 秒，訊息照實顯示', () => {
    showMoveNotice({ message: '已將 2 位學生移到 薔薇（大班）', onUndo: vi.fn() })
    expect(lastOptions().duration).toBe(8000)
    expect(lastOptions().type).toBe('success')
    expect(renderMessage().text()).toContain('已將 2 位學生移到 薔薇（大班）')
  })

  it('「復原」是真的 <button>（鍵盤可操作）；按下會先關通知再執行復原', async () => {
    const onUndo = vi.fn()
    showMoveNotice({ message: 'x', onUndo })
    const w = renderMessage()
    const btn = w.find('.plan-move-notice__undo')
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.text()).toBe('復原')
    await btn.trigger('click')
    expect(mockClose).toHaveBeenCalledOnce()
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('沒有 onUndo（例如原本都在待分班）就不出現復原鈕', () => {
    showMoveNotice({ message: '已分班' })
    expect(renderMessage().find('.plan-move-notice__undo').exists()).toBe(false)
  })

  it('回傳的 handle 可提早關閉通知', () => {
    const handle = showMoveNotice({ message: 'x', onUndo: vi.fn() })
    handle.close()
    expect(mockClose).toHaveBeenCalledOnce()
  })
})
