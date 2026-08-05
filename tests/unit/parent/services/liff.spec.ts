import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock 會被 hoist 到檔頭，factory 內不得引用一般的 top-level 變數 → 用 vi.hoisted。
const { liffInit, fetchTenantMeta } = vi.hoisted(() => ({
  liffInit: vi.fn(() => Promise.resolve()),
  fetchTenantMeta: vi.fn(),
}))

vi.mock('@line/liff', () => ({
  default: { init: liffInit, isLoggedIn: () => false, logout: vi.fn(), login: vi.fn() },
}))
vi.mock('@/api/tenantMeta', () => ({ fetchTenantMeta: () => fetchTenantMeta() }))

import { initLiff, _resetLiffInitForTests } from '@/parent/services/liff'

/**
 * LIFF ID 改 runtime（fb §4.5）：LIFF App 綁 LINE Login Channel，每間園所一組
 * ⇒ 不能是 build-time 的 VITE_LIFF_ID（一個 image 服務多租戶時會把 B 校家長
 * 送去 A 校的 LINE Login）。
 */
const ORIGINAL_ENV = { ...import.meta.env }
// ⚠ 表示「未設定」用空字串：vitest 的 import.meta.env 會把 undefined 字串化成 'undefined'。
const setEnv = (patch: Record<string, string>) => Object.assign(import.meta.env, patch)

beforeEach(() => {
  _resetLiffInitForTests()
  liffInit.mockClear()
  fetchTenantMeta.mockReset()
  setEnv({ VITE_LIFF_ID: '' })
})

afterEach(() => {
  Object.assign(import.meta.env, ORIGINAL_ENV)
  _resetLiffInitForTests()
})

it('優先用 tenant-meta 的 liff_id', async () => {
  fetchTenantMeta.mockResolvedValue({ liff_id: 'tenant-liff-1' })
  setEnv({ VITE_LIFF_ID: 'env-liff' })

  await initLiff()

  expect(liffInit).toHaveBeenCalledWith({ liffId: 'tenant-liff-1', withLoginOnExternalBrowser: true })
})

it('tenant-meta 不可用（灰度未開 / 網路錯誤）→ 退回 VITE_LIFF_ID', async () => {
  fetchTenantMeta.mockRejectedValue(new Error('disabled'))
  setEnv({ VITE_LIFF_ID: 'env-liff' })

  await initLiff()

  expect(liffInit).toHaveBeenCalledWith({ liffId: 'env-liff', withLoginOnExternalBrowser: true })
})

it('tenant-meta 有回但 liff_id 為空 → 也退回 env（園所還沒填 LINE 設定）', async () => {
  fetchTenantMeta.mockResolvedValue({ liff_id: '' })
  setEnv({ VITE_LIFF_ID: 'env-liff' })

  await initLiff()

  expect(liffInit).toHaveBeenCalledWith({ liffId: 'env-liff', withLoginOnExternalBrowser: true })
})

it('兩者皆缺 → throw，且訊息指向園所而非工程 env（看到這行的是家長）', async () => {
  fetchTenantMeta.mockRejectedValue(new Error('x'))

  await expect(initLiff()).rejects.toThrow('此園所尚未設定 LIFF ID，請聯絡園所確認 LINE 設定')
  expect(liffInit).not.toHaveBeenCalled()
})

it('失敗後可重試：_initPromise 不快取 rejection（LoginView.manualRetry 依賴）', async () => {
  fetchTenantMeta.mockRejectedValueOnce(new Error('x'))
  await expect(initLiff()).rejects.toThrow()

  fetchTenantMeta.mockResolvedValue({ liff_id: 'tenant-liff-1' })
  await expect(initLiff()).resolves.toBeUndefined()
  expect(liffInit).toHaveBeenCalledTimes(1)
})

describe('成功後的去重', () => {
  it('多次呼叫共用同一個 init promise', async () => {
    fetchTenantMeta.mockResolvedValue({ liff_id: 'tenant-liff-1' })
    await Promise.all([initLiff(), initLiff(), initLiff()])
    expect(liffInit).toHaveBeenCalledTimes(1)
  })
})
