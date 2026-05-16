import { describe, it, expect, vi, beforeEach } from 'vitest'

const SAMPLE = {
  version: '1.0.0',
  updated_at: '2026-05-16',
  categories: [{ id: 'leave', label: '請假', icon: 'x', color: '#000' }],
  items: [{ id: 'a', category: 'leave', question: 'Q', keywords: [], answer: 'A' }],
}

vi.mock('@/parent/api/assistant', () => ({
  getFaq: vi.fn(() => Promise.resolve(SAMPLE)),
}))

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('useFaq', () => {
  it('首次呼叫會 fetch 並寫入 sessionStorage', async () => {
    const { useFaq } = await import('@/parent/composables/useFaq')
    const { getFaq } = await import('@/parent/api/assistant')

    const { load, faq } = useFaq()
    await load()
    expect(getFaq).toHaveBeenCalledTimes(1)
    expect(faq.value.version).toBe('1.0.0')
    expect(JSON.parse(sessionStorage.getItem('parent_faq_v1')).version).toBe('1.0.0')
  })

  it('已有 sessionStorage 時先用快取、背景重新 fetch', async () => {
    sessionStorage.setItem('parent_faq_v1', JSON.stringify({ ...SAMPLE, version: 'cached' }))
    const { useFaq } = await import('@/parent/composables/useFaq')
    const { getFaq } = await import('@/parent/api/assistant')

    const { load, faq } = useFaq()
    await load()
    // 一進去就有快取版本
    expect(faq.value.version).toBe('cached')
    // fetch 仍然被呼叫（背景刷新）
    expect(getFaq).toHaveBeenCalledTimes(1)
  })
})
