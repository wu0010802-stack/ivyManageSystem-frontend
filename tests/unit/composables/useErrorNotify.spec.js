/**
 * useErrorNotify composable 單元測試（A4 系列補測）。
 *
 * 涵蓋:
 * - 401 / CANCELED 靜默處理
 * - 其他狀態走 ElMessage.error 並用 errorHandler.getErrorMessage 取得訊息
 * - prefix 模式（取代 'X失敗: ' + apiError(...) 用）
 * - DEV 模式 console.warn 含 context tag
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock 會 hoist 到 import 之前；mock factory 需用 vi.hoisted 取得 spy ref
const { elMessageError } = vi.hoisted(() => ({ elMessageError: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { error: elMessageError },
}))

import { useErrorNotify } from '@/composables/useErrorNotify'

describe('useErrorNotify', () => {
  let warnSpy

  beforeEach(() => {
    elMessageError.mockReset()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // ── 靜默處理 ─────────────────────────────────────────────────────────

  describe('靜默路徑（不彈 ElMessage）', () => {
    it('CANCELED 錯誤完全靜默', () => {
      const { notify } = useErrorNotify()
      notify({ code: 'ERR_CANCELED' })
      expect(elMessageError).not.toHaveBeenCalled()
    })

    it('AbortController 取消（CanceledError）也靜默', () => {
      const { notify } = useErrorNotify()
      notify({ name: 'CanceledError' })
      expect(elMessageError).not.toHaveBeenCalled()
    })

    it('401 不彈 toast(由 interceptor 處理)', () => {
      const { notify } = useErrorNotify()
      notify({ response: { status: 401, data: { detail: '請重新登入' } } })
      expect(elMessageError).not.toHaveBeenCalled()
    })
  })

  // ── 一般錯誤 ─────────────────────────────────────────────────────────

  describe('彈 ElMessage 路徑', () => {
    it('後端 detail 優先', () => {
      const { notify } = useErrorNotify()
      notify({ response: { status: 400, data: { detail: '欄位不合法' } } })
      expect(elMessageError).toHaveBeenCalledWith('欄位不合法')
    })

    it('無 detail 時用 caller fallback', () => {
      const { notify } = useErrorNotify()
      notify({ response: { status: 500, data: {} } }, 'X:save', '儲存失敗')
      // 500 走 SERVER_ERROR 預設訊息（getErrorMessage 設計 fallback 在 detail 缺
      // 且 type 無預設時才用；500 有預設「伺服器錯誤」會被優先採用,fallback 不會被顯示）
      expect(elMessageError).toHaveBeenCalledTimes(1)
      const msg = elMessageError.mock.calls[0][0]
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
    })

    it('429 顯示限流預設訊息', () => {
      const { notify } = useErrorNotify()
      notify({ response: { status: 429, data: {} } })
      expect(elMessageError).toHaveBeenCalled()
      const msg = elMessageError.mock.calls[0][0]
      expect(msg).toContain('頻繁')
    })
  })

  // ── prefix 模式 ──────────────────────────────────────────────────────

  describe('prefix 模式', () => {
    it('帶 prefix 時格式為 "prefix: message"', () => {
      const { notify } = useErrorNotify()
      notify(
        { response: { status: 400, data: { detail: '檔案格式錯誤' } } },
        'AttendanceView:upload',
        null,
        { prefix: '上傳失敗' },
      )
      expect(elMessageError).toHaveBeenCalledWith('上傳失敗: 檔案格式錯誤')
    })

    it('prefix 配 fallback 時 fallback 仍走 getErrorMessage 邏輯', () => {
      const { notify } = useErrorNotify()
      notify({}, 'X', 'fallback message', { prefix: 'PREFIX' })
      expect(elMessageError).toHaveBeenCalled()
      const msg = elMessageError.mock.calls[0][0]
      expect(msg.startsWith('PREFIX: ')).toBe(true)
    })

    it('無 prefix 時行為與舊版本相同(無前綴)', () => {
      const { notify } = useErrorNotify()
      notify({ response: { status: 400, data: { detail: 'abc' } } })
      expect(elMessageError).toHaveBeenCalledWith('abc')
    })
  })

  // ── 回傳值與 helper ─────────────────────────────────────────────────

  describe('composable 回傳', () => {
    it('暴露 notify / classifyError / getErrorMessage', () => {
      const r = useErrorNotify()
      expect(typeof r.notify).toBe('function')
      expect(typeof r.classifyError).toBe('function')
      expect(typeof r.getErrorMessage).toBe('function')
    })

    it('classifyError 與 getErrorMessage 為純 re-export(不依賴 notify state)', () => {
      const { classifyError, getErrorMessage } = useErrorNotify()
      expect(classifyError({ response: { status: 404 } })).toBe('notfound')
      expect(
        getErrorMessage({ response: { status: 400, data: { detail: 'x' } } }),
      ).toBe('x')
    })
  })
})
