import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── element-plus mock：模擬 ElMessageBox.prompt 的驗證 + 使用者輸入/取消 ──
const promptMock = vi.fn()
vi.mock('element-plus', () => ({
  ElMessageBox: { prompt: (...args: unknown[]) => promptMock(...args) },
}))

import { confirmWithReason, RULE_CHANGE_REASON_TEMPLATES } from '../confirmWithReason'

describe('confirmWithReason', () => {
  beforeEach(() => {
    promptMock.mockReset()
  })

  it('回傳輸入原因（已 trim）', async () => {
    promptMock.mockResolvedValue({ value: '  年度政策調整  ' })

    const r = await confirmWithReason({ title: '確認', message: '確定？', minLength: 5 })

    expect(r).toBe('年度政策調整')
  })

  it('提供常用原因模板', () => {
    expect(RULE_CHANGE_REASON_TEMPLATES.length).toBeGreaterThan(2)
  })

  it('使用者取消（prompt reject）回傳 null', async () => {
    promptMock.mockRejectedValue('cancel')

    const r = await confirmWithReason({ title: '確認', message: '確定？' })

    expect(r).toBeNull()
  })

  it('message 附上常用原因提示文字；title 原樣傳遞', async () => {
    promptMock.mockResolvedValue({ value: '主管裁示' })

    await confirmWithReason({ title: '新增獎金率版本', message: '將建立新版本。', minLength: 10 })

    expect(promptMock).toHaveBeenCalledTimes(1)
    const [message, title, options] = promptMock.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(message).toContain('將建立新版本。')
    expect(message).toContain('常用原因：')
    expect(message).toContain('年度政策調整')
    expect(title).toBe('新增獎金率版本')
    expect(options.inputType).toBe('textarea')
  })

  it('inputValidator：預設最小字數 10，未達標回傳錯誤字串、達標回傳 true', async () => {
    promptMock.mockImplementation(async (_m: string, _t: string, opts: { inputValidator: (v: string) => boolean | string }) => {
      expect(opts.inputValidator('短')).not.toBe(true)
      expect(opts.inputValidator('這是一段超過十個字的原因說明')).toBe(true)
      return { value: '這是一段超過十個字的原因說明' }
    })

    const r = await confirmWithReason({ title: '確認', message: '確定？' })
    expect(r).toBe('這是一段超過十個字的原因說明')
  })

  it('可自訂 minLength：3 字即通過', async () => {
    promptMock.mockImplementation(async (_m: string, _t: string, opts: { inputValidator: (v: string) => boolean | string }) => {
      expect(opts.inputValidator('三字原因')).toBe(true)
      expect(opts.inputValidator('AB')).not.toBe(true)
      return { value: '三字原因' }
    })

    await confirmWithReason({ title: '確認', message: '確定？', minLength: 3 })
  })

  it('可自訂 templates：message 帶入自訂清單而非預設模板', async () => {
    promptMock.mockResolvedValue({ value: 'x' })

    await confirmWithReason({
      title: '確認',
      message: '確定？',
      templates: ['自訂原因A', '自訂原因B'],
    })

    const [message] = promptMock.mock.calls[0] as [string]
    expect(message).toContain('自訂原因A、自訂原因B')
    expect(message).not.toContain('年度政策調整')
  })
})
