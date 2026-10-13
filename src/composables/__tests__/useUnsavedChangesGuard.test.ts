// src/composables/__tests__/useUnsavedChangesGuard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// 攔截 vue-router 的 onBeforeRouteLeave：把註冊的 guard 抓出來
let registeredGuard: (() => unknown) | null = null
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn((cb: () => unknown) => { registeredGuard = cb }),
}))

// ElMessageBox.confirm mock
const confirmMock = vi.fn()
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) },
}))

import { confirmDiscardChanges, useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'

function mountWith(isDirty: () => boolean) {
  const Host = defineComponent({
    setup() {
      const api = useUnsavedChangesGuard(isDirty)
      return () => h('div', { 'data-api': '' }, JSON.stringify(!!api.confirmDiscard))
    },
  })
  return mount(Host, { attachTo: document.body })
}

beforeEach(() => {
  registeredGuard = null
  confirmMock.mockReset()
})

describe('useUnsavedChangesGuard', () => {
  it('clean：onBeforeRouteLeave 放行、不跳 confirm', async () => {
    mountWith(() => false)
    const result = await registeredGuard!()
    expect(result).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('dirty + 使用者確認捨棄：放行', async () => {
    confirmMock.mockResolvedValue('confirm')
    mountWith(() => true)
    const result = await registeredGuard!()
    expect(confirmMock).toHaveBeenCalledOnce()
    expect(result).toBe(true)
  })

  it('dirty + 使用者取消：攔截（回 false）', async () => {
    confirmMock.mockRejectedValue('cancel')
    mountWith(() => true)
    const result = await registeredGuard!()
    expect(result).toBe(false)
  })

  it('confirmDiscard：clean 直接回 true 不跳 confirm', async () => {
    let confirmDiscard!: () => Promise<boolean>
    const Host = defineComponent({
      setup() {
        confirmDiscard = useUnsavedChangesGuard(() => false).confirmDiscard
        return () => h('div')
      },
    })
    mount(Host, { attachTo: document.body })
    expect(await confirmDiscard()).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('confirmDiscardChanges：呼叫端可換成情境文案（如切換週次），預設文案不變', async () => {
    confirmMock.mockResolvedValue('confirm')
    expect(await confirmDiscardChanges({ title: '未儲存的排班', message: '切換週次會捨棄 2 處變更。' })).toBe(true)
    expect(confirmMock).toHaveBeenLastCalledWith('切換週次會捨棄 2 處變更。', '未儲存的排班', expect.objectContaining({ confirmButtonText: '捨棄變更' }))
    await confirmDiscardChanges()
    expect(confirmMock).toHaveBeenLastCalledWith('尚有未儲存的變更，確定離開並捨棄？', '未儲存變更', expect.anything())
  })

  it('beforeunload：dirty 時 preventDefault', () => {
    mountWith(() => true)
    const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})
