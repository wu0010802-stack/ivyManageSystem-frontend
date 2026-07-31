/**
 * main.ts 的全域 auth guard — 未登入導向 /login 時保存原始目的地（深連結保存）。
 *
 * main.ts 有較重的 boot side effect（app.mount、initTheme/initA11y、offline
 * queue flush trigger 等），因此每個 it 都用 `vi.resetModules()` 重新 import
 * 一份乾淨的 router + main 模組圖，避免 guard 疊加註冊或狀態互相污染。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetMe } = vi.hoisted(() => ({ mockGetMe: vi.fn() }))

vi.mock('@/parent/api/profile', () => ({ getMe: mockGetMe }))
vi.mock('@/utils/chunkSelfHeal', () => ({ installChunkSelfHeal: vi.fn() }))

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  // probe 401 → ensureSessionProbed 不會 hydrate store，isAuthed() 維持 false
  mockGetMe.mockReset().mockRejectedValue({ response: { status: 401 } })
  vi.resetModules()
})

describe('main.ts auth guard — 深連結保存', () => {
  it('未登入導覽到受保護頁（/fees）→ 被導去 /login 且 query.redirect 帶原始 fullPath', async () => {
    const { default: router } = await import('@/parent/router')
    await import('../main')
    await router.isReady()
    await router.push('/fees')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/fees')
  })

  it('未登入導覽到公開頁（/login）→ 不需要 redirect query（本來就已經在登入頁）', async () => {
    const { default: router } = await import('@/parent/router')
    await import('../main')
    await router.isReady()
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBeUndefined()
  })
})
