import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('優先用 navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('482913')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('482913')
  })

  it('clipboard 被拒（LINE WebView）→ 退回 execCommand，且不留暫時 textarea', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    expect(await copyText('482913')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('兩條路都失敗回 false（呼叫端要提示手動複製）', async () => {
    setClipboard(undefined)
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true })
    expect(await copyText('482913')).toBe(false)
  })

  it('空字串不複製', async () => {
    expect(await copyText('')).toBe(false)
  })
})
