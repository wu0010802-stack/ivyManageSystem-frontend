/**
 * acting tenant（CT-A-06）：切換分校時必須推進管理端身分世代，否則甲校的 in-flight
 * 回應會落在乙校畫面上（hq-reporting 風險 #16）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted：mock factory 會在 import 求值期執行，早於一般 module 變數的初始化
//（`let` 在 TDZ 會直接 ReferenceError）。
const h = vi.hoisted(() => ({
  advanceAdminSession: vi.fn(),
  listeners: [] as (() => void)[],
}))
const advanceAdminSession = h.advanceAdminSession
const fireReset = (): void => h.listeners.forEach((l) => l())

vi.mock('@/utils/adminSession', () => ({
  advanceAdminSession: (...args: unknown[]) => h.advanceAdminSession(...args),
  onAdminSessionReset: (listener: () => void) => {
    h.listeners.push(listener)
    return () => {
      h.listeners = h.listeners.filter((l) => l !== listener)
    }
  },
}))

import {
  actingTenant,
  actingTenantId,
  clearActingTenant,
  platformCacheKey,
  setActingTenant,
  _resetActingTenantForTests,
} from '../useActingTenant'

const A = { id: 2, slug: 'branch-a', name: 'A 校' }
const B = { id: 3, slug: 'branch-b', name: 'B 校', public_origin: 'https://b.example.tw' }

describe('useActingTenant', () => {
  beforeEach(() => {
    _resetActingTenantForTests()
    advanceAdminSession.mockClear()
  })

  it('切換分校會呼叫 advanceAdminSession() 並記住新分校', () => {
    setActingTenant(A)
    expect(advanceAdminSession).toHaveBeenCalledTimes(1)
    expect(actingTenantId.value).toBe(2)

    setActingTenant(B)
    expect(advanceAdminSession).toHaveBeenCalledTimes(2)
    expect(actingTenant.value?.slug).toBe('branch-b')
  })

  it('同一個 id 重設不推進世代（重掛載詳情頁不該把剛載好的快取清掉）', () => {
    setActingTenant(A)
    advanceAdminSession.mockClear()
    setActingTenant({ ...A, name: 'A 校（改名）' })
    expect(advanceAdminSession).not.toHaveBeenCalled()
    // 但同 id 的欄位更新要套用（詳情頁載回完整資料）
    expect(actingTenant.value?.name).toBe('A 校（改名）')
  })

  it('清除 acting tenant 也是一次身分世代推進', () => {
    setActingTenant(A)
    advanceAdminSession.mockClear()
    clearActingTenant()
    expect(advanceAdminSession).toHaveBeenCalledTimes(1)
    expect(actingTenantId.value).toBeNull()
  })

  it('身分世代被別處推進（登入/登出/跨分頁）時 acting tenant 歸零', () => {
    setActingTenant(A)
    expect(h.listeners.length).toBeGreaterThan(0)
    fireReset()
    expect(actingTenantId.value).toBeNull()
  })

  it('advance 後才賦值：reset listener 不會把剛選好的分校清掉', () => {
    // 模擬真實的 advanceAdminSession（它會同步觸發 reset listeners）
    advanceAdminSession.mockImplementation(() => fireReset())
    setActingTenant(B)
    expect(actingTenantId.value).toBe(3)
    advanceAdminSession.mockReset()
  })

  it('platformCacheKey 帶 acting tenant；未選擇時為 all', () => {
    expect(platformCacheKey('reports:finance')).toBe('hq:all:reports:finance')
    setActingTenant(A)
    expect(platformCacheKey('reports:finance')).toBe('hq:2:reports:finance')
    // 顯式傳 null = 與 acting 無關的共用條目（分校清單）
    expect(platformCacheKey('tenants:list', null)).toBe('hq:all:tenants:list')
  })
})
